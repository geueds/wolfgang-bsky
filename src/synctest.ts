import { AppContext } from './config'
import { isFollow } from './util/subscription'

async function getAllFollowers(ctx: AppContext, repo: string) {
  let cursor: any = ''
  let currit: number = 0
  let list: any[] = []
  do {
    currit++
    const response = await ctx.api.getFollowers({
      actor: repo,
      limit: 100,
      cursor: cursor,
    })
    if (response.success && response.data?.followers?.length > 0) {
      list = list.concat(response.data.followers)
      if (response.data.followers.length < 100) {
        cursor = null
      } else {
        cursor = response.data.cursor
      }
    } else {
      cursor = null
    }
  } while (cursor !== null && currit < 10)
  return list
}

export type Followers = {
  uri: string
  cid: string | undefined
  author: any
  subject: string
  indexedAt: string
}[]

async function syncSelfFollowers(ctx: AppContext) {
  ctx.log(`Checking follows `)

  const followers = await getAllFollowers(ctx, ctx.cfg.bskyIdentifier)

  const actualFollowers: Followers = []

  for (const follower of followers) {
    const res = await ctx.api.com.atproto.repo.getRecord({
      repo: follower.did,
      collection: 'app.bsky.graph.follow',
      rkey: follower.viewer.followedBy.split('/').slice(-1),
    })
    if (res.success && isFollow(res.data.value)) {
      actualFollowers.push({
        uri: res.data.uri,
        cid: res.data.cid,
        author: follower.did,
        subject: res.data.value.subject,
        indexedAt: res.data.value.createdAt,
      })
    }
  }

  const currentFollowers = await ctx.db
    .selectFrom('follows')
    .select('uri')
    .where('subject', '=', ctx.cfg.bskyIdentifier)
    .execute()

  const followsToDelete = currentFollowers.filter(
    (x) => !actualFollowers.map((b) => b.uri).includes(x.uri),
  )
  const followsToAdd = actualFollowers.filter(
    (x) => !currentFollowers.map((b) => b.uri).includes(x.uri),
  )

  console.log(followsToAdd)
  console.log(followsToDelete)

  if (followsToAdd.length > 0 || followsToDelete.length > 0) {
    ctx.log(
      `- ${followsToAdd.length} to add, ${followsToDelete.length} to delete`,
    )
  }

  if (followsToDelete.length > 0) {
    await ctx.db
      .deleteFrom('follows')
      .where(
        'uri',
        'in',
        followsToDelete.map((b) => b.uri),
      )
      .execute()
  }

  if (followsToAdd.length > 0) {
    await ctx.db.insertInto('follows').ignore().values(followsToAdd).execute()
  }
}
