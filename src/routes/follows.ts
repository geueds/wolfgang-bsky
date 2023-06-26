import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'
import { getProfile } from './index'

const maybeStr = (val?: string | any) => {
  if (!val) return undefined
  return val
}

type Follows = {
  uri: string
  cid: string | undefined
  author: any
  subject: string
  indexedAt: string
}[]

async function getAllFollows(ctx: AppContext, repo: string) {
  let cursor: any = ''
  let currit: number = 0
  let list: any[] = []
  do {
    currit++
    const response = await ctx.api.com.atproto.repo.listRecords({
      repo: repo,
      collection: 'app.bsky.graph.follow',
      limit: 100,
      cursor: cursor,
    })
    if (response.success && response.data.records.length > 0) {
      list = list.concat(response.data.records)
      if (response.data.records.length < 100) {
        cursor = null
      } else {
        cursor = response.data.cursor
      }
    } else {
      cursor = null
    }
  } while (cursor !== null && currit < 40)
  return list
}

async function getFollowsQuery(ctx: AppContext, did: string) {
    return await ctx.db
        .with('f', (db) => db
            .selectFrom('follows')
            .innerJoin('profiles', 'profiles.did', 'follows.subject')
            .select(['uri', 'did', 'subject', 'handle', 'displayName', 'avatar', 'updatedAt', sql`follows.indexedAt`.as('indexedFollowAt')])
            .where('author', '=', did)
        )
        .with('g', (db) => db
            .selectFrom('follows')
            .select(['author', sql`follows.indexedAt`.as('indexedFollowingAt')])
            .where('subject', '=', did)
        )
        .selectFrom('f')
        .leftJoin('g', 'f.subject', 'g.author')
        .select(['f.uri', 'f.did', 'f.subject', 'f.handle', 'f.displayName', 'f.avatar', 'f.updatedAt', 'f.indexedFollowAt', 'g.indexedFollowingAt'])
        .orderBy('f.indexedFollowAt', 'asc')
        .execute()
}

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/follows', async (req, res) => {
    return res.render('follows')
  })

  router.post('/follows', async (req, res) => {
    const timeStart = Date.now()
    const intType = maybeStr(req.body.submit) ?? undefined
    const handle = maybeStr(req.body.handle)?.replace(/^@/g, '').trim() ?? ''

    if (!intType || handle.length === 0) {
      return res.render('follows')
    }

    const db_profile = await getProfile(ctx, handle)
    if (!db_profile) {
        return res.render('follows', { handle: handle, errorText: `User not found: @${handle}`})
    }

    try { 
        var profile = await ctx.api.getProfile({ actor: db_profile.did })
        if (!profile) {
            return res.render('follows', { handle: handle, errorText: `User not found: @${handle}`})
        }
    }
    catch {
        return res.render('follows', { handle: handle, errorText: `User not found: @${handle}`})
    }

    const db_follows_query = await ctx.db
    .selectFrom('follows')
    .select(sql`count(uri)`.as('count'))
    .where('author', '=', profile.data.did)
    .executeTakeFirst()
    if (!db_follows_query) return res.end()

    const query_count = db_follows_query.count as number
    const profile_count = profile.data.followsCount as number

    if ((profile_count - query_count) > 10) {
        ctx.log(`[follows] Updating follows of @${handle}`)
        const follows = await getAllFollows(ctx, profile.data.did)
        await ctx.db
            .replaceInto('follows')
            .values(
                follows.map((follow) => ({
                uri: follow.uri,
                cid: follow.cid,
                author: follow.uri.split('/')[2],
                subject: follow.value.subject,
                indexedAt: follow.value.createdAt,
                })),
            )
            .execute()
    }
    const query = await getFollowsQuery(ctx, profile.data.did)
    ctx.log(`[follows] Searched follows of @${profile.data.handle} [${profile.data.did}] [${profile_count} ${query_count}] [${(Date.now() - timeStart) / 1000}s]`)
    return res.render('follows', { handle: handle, profile: db_profile, query: query })
  })
  return router
}
