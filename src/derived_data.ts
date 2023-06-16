import { AppContext } from './config'
import { sql } from 'kysely'

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
