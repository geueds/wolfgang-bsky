import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'

export default function (ctx: AppContext) {
    const router = express.Router()

    router.get('/feeds/blocked-lately', async (req, res) => {
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
        .where('blocks.indexedAt', '>', new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString())
        .groupBy('subject')
        .having(sql`count(*)`, '>', 10)
        .orderBy(sql`count(*)`, 'desc')
        .execute()

        return res.render('blocked-lately', { query:query });
    })

    return router
}
