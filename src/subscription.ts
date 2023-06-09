import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { AppBskyEmbedImages } from '@atproto/api'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const blocksToDelete = ops.blocks.deletes.map((del) => del.uri)
    const followsToDelete = ops.follows.deletes.map((del) => del.uri)
    const likesToDelete = ops.likes.deletes.map((del) => del.uri)
    const repostsToDelete = ops.reposts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates.map((create) => {
      let keywords = create.record?.text.split(/\s/gm).filter((s) => s.startsWith('#'))
      let hasImages = 0;
      if (AppBskyEmbedImages.isMain(create.record.embed)) {
        const alt_texts = create.record.embed.images.map((image) => image.alt.split(/\s/gm).filter((s) => s.startsWith('#')))
        keywords = keywords.concat(alt_texts.flat())
        hasImages = create.record.embed.images.length;
      }
      return {
        uri: create.uri,
        cid: create.cid,
        author: create.author,
        replyParent: create.record?.reply?.parent.uri ?? null,
        replyRoot: create.record?.reply?.root.uri ?? null,
        keywords: keywords.join().toLowerCase(),
        hasImages: hasImages,
        textLength: create.record?.text.length,
        indexedAt: new Date().toISOString(),
      }
    })
    const blocksToCreate = ops.blocks.creates.map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        author: create.author,
        subject: create.record.subject,
        indexedAt: new Date().toISOString(),
      }
    })
    const followsToCreate = ops.follows.creates.map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        author: create.author,
        subject: create.record.subject,
        indexedAt: new Date().toISOString(),
      }
    })
    const likesToCreate = ops.likes.creates.map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        subjectUri: create.record.subject.uri,
        subjectCid: create.record.subject.uri,
        indexedAt: new Date().toISOString(),
      }
    })
    const repostsToCreate = ops.reposts.creates.map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        subjectUri: create.record.subject.uri,
        subjectCid: create.record.subject.uri,
        indexedAt: new Date().toISOString(),
      }
    })
  }
}
