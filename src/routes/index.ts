import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'

const maybeStr = (val?: string | any) => {
  if (!val) return undefined
  return val
}

async function getAllRecords(ctx: AppContext, repo: string, collection: string) {
  let cursor : any = ''
  let currit : number = 0
  let list : any[] = [];
  do {
    currit++
    const response = await ctx.api.com.atproto.repo.listRecords({
      repo: repo,
      collection: collection,
      limit: 100,
      cursor: cursor
    })
    if (response.success && response.data?.records?.length > 0) {
      list = list.concat(response.data.records)
      if (response.data.records.length < 100) {
        cursor = null
      } else {
        cursor = response.data.cursor
      }
    } else {
      cursor = null
    }
  } while (cursor !== null && currit < 5)
  return list
}

async function syncBlocks (ctx: AppContext, repo: string) {
  const actualBlocks = await getAllRecords(ctx, repo, 'app.bsky.graph.block')
  const currentBlocks = await ctx.db
  .selectFrom('blocks')
  .select('uri')
  .where('author', '=', repo)
  .execute()

  const blocksToDelete = currentBlocks.filter(x => !actualBlocks.map(b => b.uri).includes(x.uri))
  const blocksToAdd = actualBlocks.filter(x => !currentBlocks.map(b => b.uri).includes(x.uri))

  if (blocksToDelete.length > 0) {
    await ctx.db
    .deleteFrom('blocks')
    .where('uri', 'in', blocksToDelete.map(b => b.uri))
    .execute()
  }

  if (blocksToAdd.length > 0) {
    await ctx.db
    .insertInto('blocks')
    .ignore()
    .values(blocksToAdd.map((block) => {
      return {
        uri: block.uri,
        cid: block.cid,
        author: repo,
        subject: block.value.subject,
        indexedAt: block.value.createdAt,
      }
    }))
    .execute()
  }
}

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    return res.render('index');
  })

  router.get('/interactions', async (req, res) => {
    const handle = maybeStr(req.query.handle)?.replace(/^@/g, '').trim()
    const interactions = {withMe: {}, withOthers: {}}

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
            const timeCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
            
            // syncBlocks(ctx, user.did)

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
                'avatar',
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
                'avatar',
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
            textVal = `User not found: "${handle}"`
        }
    }

    return res.render('interactions', { handle: handle, userFound: userFound, textVal: textVal, interactions: interactions });
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

        syncBlocks(ctx, user.did)

        blocks = await ctx.db
        .selectFrom('blocks')
        .innerJoin('profiles', 'profiles.did', 'blocks.author')
        .select(['did', 'handle', 'displayName', 'blocks.indexedAt'])
        .where('subject', '=', user.did)
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
