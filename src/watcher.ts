import { createDb, Database } from './db'
import { Config } from './config'
import { BskyAgent } from '@atproto/api'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import dotenv from 'dotenv'
import {
  AppBskyEmbedImages,
  AppBskyEmbedRecordWithMedia,
  AppBskyEmbedRecord,
  RichText,
} from '@atproto/api'
import { getDateTime } from './derived_data'

class FirehoseSubscription extends FirehoseSubscriptionBase {
  async getPost(text: string) {
    const rt = new RichText({text: text})
    await rt.detectFacets(this.api) // automatically detects mentions and links
    const postRecord = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: getDateTime()
    }
  }
  
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const blocksToDelete = ops.blocks.deletes.map((del) => del.uri)
    const followsToDelete = ops.follows.deletes.map((del) => del.uri)
    const likesToDelete = ops.likes.deletes.map((del) => del.uri)
    const repostsToDelete = ops.reposts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates.map((create) => {

      // post with images
      if (AppBskyEmbedImages.isMain(create.record.embed)) {
        console.log(create.record.embed.images.length)
        console.log('post with images')
      }

      // text-only post quoting a post
      if (AppBskyEmbedRecord.isMain(create.record.embed)) {
        console.log(create.record.embed.record.uri)
        console.log('text-only post quoting a post')
      }

      // post with media quoting a post
      if (AppBskyEmbedRecordWithMedia.isMain(create.record.embed)) {
        if (create.record.text.toLowerCase().includes('trend')) {
          console.log(create.record.text)
        }
        if (AppBskyEmbedRecord.isMain(create.record.embed.record)) {
          console.log(create.record.embed.record.record.uri)
        }
        if (AppBskyEmbedImages.isMain(create.record.embed.media)) {
          console.log(create.record.embed.media.images.length)
        }
        console.log(`post with images and quoting`)
      }
      return {
        uri: create.uri,
        cid: create.cid,
        author: create.author,
        text: create.record.text,
        embed: create.record.embed,
        replyParent: create.record?.reply?.parent.uri ?? null,
        replyRoot: create.record?.reply?.root.uri ?? null,
        indexedAt: getDateTime(),
      }
    })
    const followsToCreate = ops.follows.creates.map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        author: create.author,
        subject: create.record.subject,
        indexedAt: getDateTime(),
      }
    })
    const likesToCreate = ops.likes.creates.map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        subjectUri: create.record.subject.uri,
        subjectCid: create.record.subject.cid,
        indexedAt: getDateTime(),
      }
    })

    // for (const post of postsToCreate) {
    //     console.log(post.embed)
    // }
  }
}

class Watcher {
  public db: Database
  public firehose: FirehoseSubscription
  public cfg: Config
  public api: BskyAgent

  constructor(
    db: Database,
    firehose: FirehoseSubscription,
    cfg: Config,
    api: BskyAgent,
  ) {
    this.db = db
    this.firehose = firehose
    this.cfg = cfg
    this.api = api
  }

  static async create(cfg: Config) {
    const db = createDb(
      cfg.mysqlDatabase,
      cfg.mysqlHost,
      cfg.mysqlPort,
      cfg.mysqlUser,
      cfg.mysqlPassword,
    )
    const api = new BskyAgent({ service: 'https://bsky.social' })
    await api.login({
      identifier: cfg.bskyIdentifier,
      password: cfg.bskyPassword,
    })
    const firehose = new FirehoseSubscription(db, cfg, api)
    return new Watcher(db, firehose, cfg, api)
  }

  async start(): Promise<void> {
    this.firehose.run(this.cfg.subscriptionReconnectDelay)
  }
}

const run = async () => {
  dotenv.config()
  const hostname = maybeStr(process.env.WOLFGANG_HOSTNAME) ?? 'example.com'
  const server = await Watcher.create({
    devel: !!maybeInt(process.env.WOLFGANG_DEVEL) ?? true,
    port: maybeInt(process.env.WOLFGANG_WATCHER_PORT) ?? 3007,
    listenhost: maybeStr(process.env.WOLFGANG_LISTENHOST) ?? 'localhost',
    bskyIdentifier: maybeStr(process.env.WOLFGANG_BSKY_IDENTIFIER) ?? '',
    bskyPassword: maybeStr(process.env.WOLFGANG_BSKY_PASSWORD) ?? '',
    mysqlDatabase: maybeStr(process.env.WOLFGANG_MYSQL_DATABASE) ?? 'bsky',
    mysqlHost: maybeStr(process.env.WOLFGANG_MYSQL_HOST) ?? 'localhost',
    mysqlPort: maybeInt(process.env.WOLFGANG_MYSQL_PORT) ?? 3306,
    mysqlUser: maybeStr(process.env.WOLFGANG_MYSQL_USER) ?? '',
    mysqlPassword: maybeStr(process.env.WOLFGANG_MYSQL_PASSWORD) ?? '',
    subscriptionReconnectDelay:
      maybeInt(process.env.WOLFGANG_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    subscriptionEndpoint:
      maybeStr(process.env.WOLFGANG_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.social',
    hostname,
  })
  await server.start()
  console.log(
    `running Watcher at http://${server.cfg.listenhost}:${server.cfg.port}`,
  )
}

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

run()
