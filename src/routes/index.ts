import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'

const maybeStr = (val?: string | any) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    return res.render('index');
  })

  router.get('/interactions', async (req, res) => {
    const handle = maybeStr(req.query.handle)?.replace(/^@/g, '').trim()

    let userFound = false
    let textVal = ''

    if (handle && handle.length > 0) {
        const user = await ctx.db
        .selectFrom('profiles')
        .select(['did', 'handle'])
        .where('handle', '=', handle)
        .limit(1)
        .executeTakeFirst()

        if (!!user) {
            console.log(`Searching interactions of ${user.did}: @${user.handle}`)
            userFound = true
            textVal = ''
            const timeCutoff = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()

            const withOthers = await ctx.db
            .with('commentsTable', (db) => db
                .selectFrom('posts')
                .where('uri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(posts.replyParent, 6, 32)`.as('did'),
                    sql`SUM(posts.textLength)`.as('charactersGiven'),
                    sql`count(*)`.as('commentsGiven')
                ])
                .groupBy('did')
            )
            .with('quotesTable', (db) => db
                .selectFrom('posts')
                .where('uri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(posts.quoteUri, 6, 32)`.as('did'),
                    sql`count(*)`.as('quotesGiven')
                ])
                .groupBy('did')
            )
            .with('repostsTable', (db) => db
                .selectFrom('reposts')
                .where('uri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([sql`SUBSTR(reposts.subjectUri, 6, 32)`.as('did'), sql`count(*)`.as('repostsGiven')])
                .groupBy('did')
            )
            .with('likesTable', (db) => db
                .selectFrom('likes')
                .where('uri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(likes.subjectUri, 6, 32)`.as('did'),
                    sql`count(*)`.as('likesGiven')
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
                'avatar',
                'commentsGiven',
                'quotesGiven',
                'repostsGiven',
                'likesGiven',
                'charactersGiven',
                sql`(COALESCE(commentsGiven, 0) + COALESCE(quotesGiven, 0) + COALESCE(repostsGiven, 0) + COALESCE(likesGiven, 0))`.as('totalGiven'),
            ])
            .where('profiles.did', '!=', user.did)
            .groupBy([
                'profiles.did',
                'commentsGiven',
                'quotesGiven',
                'repostsGiven',
                'likesGiven'
            ])
            .orderBy('totalGiven', 'desc')
            .having(({or, cmpr}) => or([
                cmpr('commentsGiven', '>', 0),
                cmpr('quotesGiven', '>', 0),
                cmpr('repostsGiven', '>', 0),
                cmpr('likesGiven', '>', 0),
            ]))
            .limit(20)
            .execute()

            const withMe = await ctx.db
            .with('commentsTable', (db) => db
                .selectFrom('posts')
                .where('replyParent', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(posts.uri, 6, 32)`.as('did'),
                    sql`SUM(posts.textLength)`.as('charactersReceived'),
                    sql`count(*)`.as('commentsReceived')
                ])
                .groupBy('did')
            )
            .with('quotesTable', (db) => db
                .selectFrom('posts')
                .where('quoteUri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(posts.uri, 6, 32)`.as('did'),
                    sql`count(*)`.as('quotesReceived')
                ])
                .groupBy('did')
            )
            .with('repostsTable', (db) => db
                .selectFrom('reposts')
                .where('subjectUri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([sql`SUBSTR(reposts.uri, 6, 32)`.as('did'), sql`count(*)`.as('repostsReceived')])
                .groupBy('did')
            )
            .with('likesTable', (db) => db
                .selectFrom('likes')
                .where('subjectUri', 'like', `at://${user.did}%`)
                .where('indexedAt', '>', timeCutoff)
                .select([
                    sql`SUBSTR(likes.uri, 6, 32)`.as('did'),
                    sql`count(*)`.as('likesReceived')
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
                'avatar',
                'charactersReceived',
                'commentsReceived',
                'quotesReceived',
                'repostsReceived',
                'likesReceived',
                sql`(COALESCE(commentsReceived, 0) + COALESCE(quotesReceived, 0) + COALESCE(repostsReceived, 0) + COALESCE(likesReceived, 0))`.as('totalReceived'),
            ])
            .where('profiles.did', '!=', user.did)
            .groupBy([
                'profiles.did',
                'commentsReceived',
                'quotesReceived',
                'repostsReceived',
                'likesReceived'
            ])
            .orderBy('totalReceived', 'desc')
            .having(({or, cmpr}) => or([
                cmpr('commentsReceived', '>', 0),
                cmpr('quotesReceived', '>', 0),
                cmpr('repostsReceived', '>', 0),
                cmpr('likesReceived', '>', 0),
            ]))
            .limit(20)
            .execute()

            const interactions = [
              ...withMe.filter(v => !(withOthers.find(sp => sp.did === v.did))).map(v => ({
                  ...v,
                  charactersGiven: 0,
                  commentsGiven: 0,
                  quotesGiven: 0,
                  repostsGiven: 0,
                  likesGiven: 0,
                  totalGiven: 0,
              })),
              ...withOthers.map(v => {
                const matchingObj = withMe.find(x => x.did === v.did);
                if (matchingObj) {
                  return { ...matchingObj, ...v };
                } else {
                  return {
                    ...v,
                    charactersReceived: 0,
                    commentsReceived: 0,
                    quotesReceived: 0,
                    repostsReceived: 0,
                    likesReceived: 0,
                    totalReceived: 0,
                  };
                }
              })
            ]
            .map(v => ({
              ...v,
              charactersGiven: maybeInt(<string>v.charactersGiven) ?? 0,
              commentsGiven: v.commentsGiven ??  0,
              quotesGiven: v.quotesGiven ??  0,
              repostsGiven: v.repostsGiven ??  0,
              likesGiven: v.likesGiven ??  0,
              totalGiven: <number>v.totalGiven ??  0,
              charactersReceived: maybeInt(<string>v.charactersReceived) ?? 0,
              commentsReceived: v.commentsReceived ??  0,
              quotesReceived: v.quotesReceived ??  0,
              repostsReceived: v.repostsReceived ??  0,
              likesReceived: v.likesReceived ??  0,
              totalReceived: <number>v.totalReceived ??  0,
            }))
            .map(v => ({...v, total: v.totalGiven + v.totalReceived}))
            .sort((a, b) => (a.total > b.total) ? -1 : 1)
            .slice(0, 20)

            return res.render('interactions', { handle: handle, userFound: userFound, textVal: textVal, interactions: interactions });
        } else {
            userFound = false
            textVal = `User not found: "${handle}"`
        }
    }

    return res.render('interactions', { handle: handle, userFound: userFound, textVal: textVal, interactions: null });
  })

  router.get('/blocks', async (req, res) => {
    const handle = maybeStr(req.query.handle)?.replace(/^@/g, '').trim()

    let userFound = false
    let textVal = ''
    let blocks = {}

    if (handle && handle.length > 0) {
      const user = await ctx.db
      .selectFrom('profiles')
      .select(['did', 'handle'])
      .where('handle', '=', handle)
      .limit(1)
      .executeTakeFirst()

      if (!!user) {
        console.log(`Searching blocks of ${user.did}: @${user.handle}`)
        userFound = true
        textVal = ''

        blocks = await ctx.db
        .selectFrom('blocks')
        .innerJoin('profiles', 'profiles.did', 'blocks.author')
        .select(['did', 'handle', 'displayName', 'blocks.indexedAt'])
        .where('subject', '=', user.did)
        .orderBy('indexedAt', 'desc')
        .execute()
      } else {
        userFound = false
        textVal = `User not found: "${handle}"`
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
