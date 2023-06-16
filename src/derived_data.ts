import { AppContext } from './config'
import { sql } from 'kysely'

export async function updateLickablePosts(ctx: AppContext) {
}

export async function updateLickablePeople(ctx: AppContext) {
  const follows = await ctx.db
  .selectFrom('follows')
  .innerJoin('profiles', 'profiles.did', 'follows.subject')
  .select(['uri', 'subject', 'handle'])
  .where('author', '=', ctx.cfg.bskyIdentifier)
  .execute()

  const followers = await ctx.db
  .selectFrom('follows')
  .innerJoin('profiles', 'profiles.did', 'follows.author')
  .select(['uri', 'author', 'handle'])
  .where('subject', '=', ctx.cfg.bskyIdentifier)
  .execute()

  const query = await ctx.db
  .selectFrom('derived_data')
  .select('data')
  .where('name', '=', 'top_blocks')
  .executeTakeFirst()
  // @ts-ignore
  const top_blocked = query?.data.map(x => x.did)

  follows.filter(x => !followers.map(q => q.author).includes(x.subject)).forEach(follow => {
    ctx.log(`[followers] unfollowing: ${follow.handle} [${follow.subject}]`)
    ctx.api.deleteFollow(follow.uri)
  })

  followers.filter(x => !follows.map(q => q.subject).includes(x.author)).forEach(follower => {
    if (!top_blocked.includes(follower.author)) {
      ctx.log(`[followers] following: ${follower.handle} [${follower.author}]`)
      ctx.api.follow(follower.author)
    }
  })

  return followers
}

export async function updateTopFollowed(ctx: AppContext) {
  const data = await ctx.db
  .selectFrom('follows')
  .innerJoin('profiles', 'subject', 'did')
  .select([
    'did',
    'subject', 
    'handle', 
    'displayName',
    'avatar',
    sql`count(uri)`.as('count'), 
    sql`max(follows.indexedAt)`.as('mostRecent')
  ])
  .groupBy('subject')
  .where('follows.indexedAt', '>', new Date(Date.now() - 1 * 48 * 3600 * 1000).toISOString().substring(0, 10))
  .orderBy('count', 'desc')
  .limit(100)
  .execute()

  await ctx.db
  .replaceInto('derived_data')
  .values({
    name: 'top_follows',
    data: JSON.stringify(data),
    updatedAt: new Date().toISOString()
  })
  .executeTakeFirst()
}

export async function updateTopBlocked(ctx: AppContext) {
  const data = await ctx.db
  .selectFrom('blocks')
  .innerJoin('profiles', 'subject', 'did')
  .select([
    'did',
    'subject', 
    'handle', 
    'displayName',
    'avatar',
    sql`count(uri)`.as('count'), 
    sql`max(blocks.indexedAt)`.as('mostRecent')
  ])
  .groupBy('subject')
  .where('blocks.indexedAt', '>', new Date(Date.now() - 1 * 48 * 3600 * 1000).toISOString().substring(0, 10))
  .orderBy('count', 'desc')
  .limit(25)
  .execute()

  await ctx.db
  .replaceInto('derived_data')
  .values({
    name: 'top_blocks',
    data: JSON.stringify(data),
    updatedAt: new Date().toISOString()
  })
  .executeTakeFirst()
}

export async function updateProfile(ctx: AppContext, actor: string) {
    const profile = await ctx.api.getProfile({ actor: actor })
    if (!!profile) {
      await ctx.db
      .updateTable('profiles')
      .set({
        handle: profile.data.handle,
        displayName: profile.data.displayName,
        avatar: profile.data.avatar ?? null,
        description: profile.data.description ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where('did', '=', profile.data.did)
      .execute()
    }
    return profile?.data
}
