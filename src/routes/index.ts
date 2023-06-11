import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'

const maybeStr = (val?: string | any) => {
    if (!val) return undefined
    return val
}

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    return res.render('index');
  })

  router.get('/blocks', async (req, res) => {
    const handle = maybeStr(req.query.handle)

    let userFound = false
    let textVal = ''
    let blocks = {}

    if (handle && handle.length > 0) {
      const user = await ctx.db
      .selectFrom('profiles')
      .select('did')
      .where('handle', '=', handle)
      .limit(1)
      .executeTakeFirst()

      if (!!user) {
        userFound = true
        textVal = ''

        blocks = await ctx.db
        .selectFrom('blocks')
        .innerJoin('profiles', 'profiles.did', 'blocks.author')
        .select(['did', 'handle', 'displayName', 'blocks.indexedAt'])
        .where('subject', '=', user.did)
        .execute()
      } else {
        userFound = false
        textVal = 'User not found.'
      }
    }

    return res.render('blocks', { handle: handle, userFound: userFound, textVal: textVal, blocks: blocks });
  })

  router.get('/topblocks', async (req, res) => {
    const query = await ctx.db
    .selectFrom('blocks')
    .innerJoin('profiles', 'subject', 'did')
    .select([
      'subject', 
      sql`count(*)`.as('count'), 
      sql`max(blocks.indexedAt)`.as('mostRecent'),
      'handle', 
      'displayName'
    ])
    .groupBy('subject')
    .where('blocks.indexedAt', '>', new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString())
    .orderBy(sql`count(*)`, 'desc')
    .limit(50)
    .execute()

    const since = await ctx.db
    .selectFrom('blocks')
    .select(sql`min(indexedAt)`.as('value'))
    .executeTakeFirst()

    return res.render('topBlocks', { query:query, since: since?.value });
  })

  router.get('/topfollows', async (req, res) => {
    const query = await ctx.db
    .selectFrom('follows')
    .innerJoin('profiles', 'subject', 'did')
    .select([
      'subject', 
      sql`count(*)`.as('count'), 
      sql`max(follows.indexedAt)`.as('mostRecent'),
      'handle', 
      'displayName'
    ])
    .groupBy('subject')
    .where('follows.indexedAt', '>', new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString())
    .orderBy(sql`count(*)`, 'desc')
    .limit(50)
    .execute()

    const since = await ctx.db
    .selectFrom('follows')
    .select(sql`min(indexedAt)`.as('value'))
    .executeTakeFirst()

    return res.render('topFollows', { query:query, since: since?.value });
  })

  return router
}
