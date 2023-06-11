import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'

const maybeStr = (val?: string | any) => {
    if (!val) return undefined
    return val
}

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/interactions', async (req, res) => {
    const handle = maybeStr(req.query.handle)
    const interactions = {withMe: {}, withOthers: {}}

    let userFound = false
    let textVal = ''

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
            const timeCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

            interactions.withOthers = await ctx.db
            .with('commentsTable', (db) => db
                .selectFrom('posts')
                .where('uri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(posts.replyParent, 6, 32)`.as('did'),
                    sql`SUM(posts.textLength)`.as('totalTextLength'),
                    sql`count(*)`.as('commentsCount')
                ])
                .groupBy('did')
            )
            .with('quotesTable', (db) => db
                .selectFrom('posts')
                .where('uri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(posts.quoteUri, 6, 32)`.as('did'),
                    sql`count(*)`.as('quotesCount')
                ])
                .groupBy('did')
            )
            .with('repostsTable', (db) => db
                .selectFrom('reposts')
                .where('uri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([sql`SUBSTR(reposts.subjectUri, 6, 32)`.as('did'), sql`count(*)`.as('repostsCount')])
                .groupBy('did')
            )
            .with('likesTable', (db) => db
                .selectFrom('likes')
                .where('uri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(likes.subjectUri, 6, 32)`.as('did'),
                    sql`count(*)`.as('likesCount')
                ])
                .groupBy('did')
            )
            .selectFrom('profiles')
            .leftJoin('commentsTable', 'commentsTable.did', 'profiles.did')
            .leftJoin('quotesTable', 'quotesTable.did', 'profiles.did')
            .leftJoin('repostsTable', 'repostsTable.did', 'profiles.did')
            .leftJoin('likesTable', 'likesTable.did', 'profiles.did')
            .select([
                'profiles.did',
                'handle',
                'displayName',
                'commentsCount',
                'quotesCount',
                'repostsCount',
                'likesCount',
                'totalTextLength',
                sql`(COALESCE(commentsCount, 0) + COALESCE(quotesCount, 0) + COALESCE(repostsCount, 0) + COALESCE(likesCount, 0))`.as('totalCount'),
            ])
            .where('profiles.did', '!=', user.did)
            .groupBy([
                'profiles.did',
                'commentsCount',
                'quotesCount',
                'repostsCount',
                'likesCount'
            ])
            .orderBy('totalCount', 'desc')
            .having(({or, cmpr}) => or([
                cmpr('commentsCount', '>', 0),
                cmpr('quotesCount', '>', 0),
                cmpr('repostsCount', '>', 0),
                cmpr('likesCount', '>', 0),
            ]))
            .limit(20)
            .execute()

            interactions.withMe = await ctx.db
            .with('commentsTable', (db) => db
                .selectFrom('posts')
                .where('replyParent', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(posts.uri, 6, 32)`.as('did'),
                    sql`SUM(posts.textLength)`.as('totalTextLength'),
                    sql`count(*)`.as('commentsCount')
                ])
                .groupBy('did')
            )
            .with('quotesTable', (db) => db
                .selectFrom('posts')
                .where('quoteUri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(posts.uri, 6, 32)`.as('did'),
                    sql`count(*)`.as('quotesCount')
                ])
                .groupBy('did')
            )
            .with('repostsTable', (db) => db
                .selectFrom('reposts')
                .where('subjectUri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([sql`SUBSTR(reposts.uri, 6, 32)`.as('did'), sql`count(*)`.as('repostsCount')])
                .groupBy('did')
            )
            .with('likesTable', (db) => db
                .selectFrom('likes')
                .where('subjectUri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(likes.uri, 6, 32)`.as('did'),
                    sql`count(*)`.as('likesCount')
                ])
                .groupBy('did')
            )
            .selectFrom('profiles')
            .leftJoin('commentsTable', 'commentsTable.did', 'profiles.did')
            .leftJoin('quotesTable', 'quotesTable.did', 'profiles.did')
            .leftJoin('repostsTable', 'repostsTable.did', 'profiles.did')
            .leftJoin('likesTable', 'likesTable.did', 'profiles.did')
            .select([
                'profiles.did',
                'handle',
                'displayName', 
                'commentsCount',
                'quotesCount',
                'repostsCount',
                'likesCount',
                'totalTextLength',
                sql`(COALESCE(commentsCount, 0) + COALESCE(quotesCount, 0) + COALESCE(repostsCount, 0) + COALESCE(likesCount, 0))`.as('totalCount'),
            ])
            .where('profiles.did', '!=', user.did)
            .groupBy([
                'profiles.did',
                'commentsCount',
                'quotesCount',
                'repostsCount',
                'likesCount'
            ])
            .orderBy('totalCount', 'desc')
            .having(({or, cmpr}) => or([
                cmpr('commentsCount', '>', 0),
                cmpr('quotesCount', '>', 0),
                cmpr('repostsCount', '>', 0),
                cmpr('likesCount', '>', 0),
            ]))
            .limit(20)
            .execute()
        } else {
            userFound = false
            textVal = 'User not found.'
        }
    }

    return res.render('interactions', { handle: handle, userFound: userFound, textVal: textVal, interactions: interactions });
  })

//   router.get('/db/blocks', async (req, res) => {
//     const query = await ctx.db
//     .selectFrom('blocks')
//     .innerJoin('profiles', 'subject', 'did')
//     .select([
//       'subject', 
//       sql`count(*)`.as('count'), 
//       sql`max(blocks.indexedAt)`.as('mostRecent'),
//       'handle', 
//       'displayName'
//     ])
//     .groupBy('subject')
//     .where('blocks.indexedAt', '>', new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString())
//     .orderBy(sql`count(*)`, 'desc')
//     .limit(50)
//     .execute()

//     const since = await ctx.db
//     .selectFrom('blocks')
//     .select(sql`min(indexedAt)`.as('value'))
//     .executeTakeFirst()

//     return res.render('blocks', { query:query, since: since?.value });
//   })

  return router
}
