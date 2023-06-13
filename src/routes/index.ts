import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'
import { createCanvas, loadImage } from 'canvas'
import rateLimit from 'express-rate-limit'  

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

const getCircles = async (interactions: any) => {
  const layers = [8, 15];
  const config = [
    {distance: 0, count: 1, radius: 110, users: [interactions.user]},
    {distance: 200, count: layers[0], radius: 64, users: interactions.table.slice(0, 8)},
    {distance: 330, count: layers[1], radius: 58, users: interactions.table.slice(8)},
    // {distance: 450, count: layers[2], radius: 50, users: interactions.table.slice(8+15)}, // 26
  ]

  const width = 800;
  const height = 800;

  const canvas = createCanvas(width, height);
  const cctx = canvas.getContext("2d");

  // fill the background
  cctx.fillStyle = "#1338BE";
  cctx.fillRect(0, 0, width, height);

  // loop over the layers
  for (const [layerIndex, layer] of config.entries()) {
    const {count, radius, distance, users} = layer;

    const angleSize = 360 / count;

    // loop over each circle of the layer
    for (let i = 0; i < count; i++) {
      // We need an offset or the first circle will always on the same line and it looks weird
      // Try removing this to see what happens
      const offset = layerIndex * 30;

      // i * angleSize is the angle at which our circle goes
      // We need to converting to radiant to work with the cos/sin
      const r = toRad(i * angleSize + offset);

      const centerX = Math.cos(r) * distance + width / 2;
      const centerY = Math.sin(r) * distance + height / 2;

      // if we are trying to render a circle but we ran out of users, just exit the loop. We are done.
      if (!users[i]) break;

      cctx.save();
      cctx.beginPath();
      cctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      cctx.clip();

      const defaultAvatarUrl = 'src/routes/person-fill.svg';

      const img = await loadImage(users[i].avatar || defaultAvatarUrl);
      if (users[i].avatar) {
        cctx.drawImage(
          img,
          centerX - radius,
          centerY - radius,
          radius * 2,
          radius * 2
        );
      } else {
        cctx.drawImage(
          img,
          centerX - radius,
          centerY - radius,
        );
      }

      cctx.restore();
    }
  }
  console.log(`figure done: @${interactions.user.handle}`)

  return canvas
}

const getProfile = async (ctx: AppContext, handle: string) => {
  return await ctx.db
  .selectFrom('profiles')
  .select(['did', 'handle', 'displayName', 'avatar'])
  .where(({or, cmpr}) => or([
    cmpr('did', '=', handle),
    cmpr('handle', '=', handle),
    cmpr('handle', '=', `${handle}.bsky.social`),
  ]))
  .limit(1)
  .executeTakeFirst()
}

const getInteractions = async (ctx: AppContext, user: any, limit: number, timeCutoff: string) => {
  if (!!user) {
      console.log(`Searching ${limit} interactions of ${user.did}: @${user.handle}`)

      const queryTable = await ctx.db
      .with('commentsGivenTable', (db) => db
          .selectFrom('posts')
          .where('author', '=', user.did)
          .where('indexedAt', '>', timeCutoff)
          .select([
              sql`SUBSTR(posts.replyParent, 6, 32)`.as('did'),
              sql`SUM(textLength)`.as('charactersGiven'),
              sql`count(uri)`.as('commentsGiven')
          ])
          .groupBy('did')
          .orderBy('commentsGiven', 'desc')
      )
      .with('commentsReceivedTable', (db) => db
          .selectFrom('posts')
          .where('replyParent', 'like', `at://${user.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
              sql`author`.as('did'),
              sql`SUM(textLength)`.as('charactersReceived'),
              sql`count(uri)`.as('commentsReceived')
          ])
          .groupBy('did')
          .orderBy('commentsReceived', 'desc')
      )
      .with('quotesGivenTable', (db) => db
          .selectFrom('posts')
          .where('author', '=', user.did)
          .where('indexedAt', '>', timeCutoff)
          .select([
              sql`SUBSTR(posts.quoteUri, 6, 32)`.as('did'),
              sql`count(uri)`.as('quotesGiven')
          ])
          .groupBy('did')
          .orderBy('quotesGiven', 'desc')
      )
      .with('quotesReceivedTable', (db) => db
          .selectFrom('posts')
          .where('quoteUri', 'like', `at://${user.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
              sql`author`.as('did'),
              sql`count(uri)`.as('quotesReceived')
          ])
          .groupBy('did')
          .orderBy('quotesReceived', 'desc')
      )
      .with('repostsGivenTable', (db) => db
          .selectFrom('reposts')
          .where('uri', 'like', `at://${user.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
              sql`SUBSTR(reposts.subjectUri, 6, 32)`.as('did'),
              sql`count(uri)`.as('repostsGiven')
          ])
          .groupBy('did')
          .orderBy('repostsGiven', 'desc')
      )
      .with('repostsReceivedTable', (db) => db
          .selectFrom('reposts')
          .where('subjectUri', 'like', `at://${user.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
              sql`SUBSTR(reposts.uri, 6, 32)`.as('did'),
              sql`count(uri)`.as('repostsReceived')
          ])
          .groupBy('did')
          .orderBy('repostsReceived', 'desc')
      )
      .with('likesGivenTable', (db) => db
          .selectFrom('likes')
          .where('uri', 'like', `at://${user.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
              sql`SUBSTR(likes.subjectUri, 6, 32)`.as('did'),
              sql`count(uri)`.as('likesGiven')
          ])
          .groupBy('did')
          .orderBy('likesGiven', 'desc')
      )
      .with('likesReceivedTable', (db) => db
          .selectFrom('likes')
          .where('subjectUri', 'like', `at://${user.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
              sql`SUBSTR(likes.uri, 6, 32)`.as('did'),
              sql`count(uri)`.as('likesReceived')
          ])
          .groupBy('did')
          .orderBy('likesReceived', 'desc')
      )
      .selectFrom('profiles')
      .leftJoin('commentsGivenTable', 'commentsGivenTable.did', 'profiles.did')
      .leftJoin('commentsReceivedTable', 'commentsReceivedTable.did', 'profiles.did')
      .leftJoin('quotesGivenTable', 'quotesGivenTable.did', 'profiles.did')
      .leftJoin('quotesReceivedTable', 'quotesReceivedTable.did', 'profiles.did')
      .leftJoin('repostsGivenTable', 'repostsGivenTable.did', 'profiles.did')
      .leftJoin('repostsReceivedTable', 'repostsReceivedTable.did', 'profiles.did')
      .leftJoin('likesGivenTable', 'likesGivenTable.did', 'profiles.did')
      .leftJoin('likesReceivedTable', 'likesReceivedTable.did', 'profiles.did')
      .select([
          'profiles.did',
          'handle',
          'displayName',
          'avatar',
          sql`IFNULL(commentsGiven, 0)`.as('commentsGiven'),
          sql`IFNULL(quotesGiven, 0)`.as('quotesGiven'),
          sql`IFNULL(repostsGiven, 0)`.as('repostsGiven'),
          sql`IFNULL(likesGiven, 0)`.as('likesGiven'),
          sql`IFNULL(charactersGiven, 0)`.as('charactersGiven'),
          sql`IFNULL(commentsReceived, 0)`.as('commentsReceived'),
          sql`IFNULL(quotesReceived, 0)`.as('quotesReceived'),
          sql`IFNULL(repostsReceived, 0)`.as('repostsReceived'),
          sql`IFNULL(likesReceived, 0)`.as('likesReceived'),
          sql`IFNULL(charactersReceived, 0)`.as('charactersReceived'),
          sql`(IFNULL(commentsGiven, 0) + IFNULL(quotesGiven, 0) + IFNULL(repostsGiven, 0) + IFNULL(likesGiven, 0))`.as('totalGiven'),
          sql`(IFNULL(commentsReceived, 0) + IFNULL(quotesReceived, 0) + IFNULL(repostsReceived, 0) + IFNULL(likesReceived, 0))`.as('totalReceived'),
          sql`(IFNULL(commentsGiven, 0) + IFNULL(quotesGiven, 0) + IFNULL(repostsGiven, 0) + IFNULL(likesGiven, 0) + IFNULL(commentsReceived, 0) + IFNULL(quotesReceived, 0) + IFNULL(repostsReceived, 0) + IFNULL(likesReceived, 0))`.as('total')
      ])
      .where('profiles.did', '!=', user.did)
      .groupBy([
          'profiles.did',
          'commentsGiven',
          'quotesGiven',
          'repostsGiven',
          'likesGiven',
          'commentsReceived',
          'quotesReceived',
          'repostsReceived',
          'likesReceived',
      ])
      .orderBy('total', 'desc')
      .having(({or, cmpr}) => or([
        cmpr('commentsGiven', '>', 0),
        cmpr('quotesGiven', '>', 0),
        cmpr('repostsGiven', '>', 0),
        cmpr('likesGiven', '>', 0),
        cmpr('commentsReceived', '>', 0),
        cmpr('quotesReceived', '>', 0),
        cmpr('repostsReceived', '>', 0),
        cmpr('likesReceived', '>', 0),
      ]))
      .limit(limit)
      .execute()

      console.log(`search done: @${user.handle}`)

      return {user: user, table: queryTable }
  }
  return undefined
}

const toRad = (x: number) => x * (Math.PI / 180);

export default function (ctx: AppContext) {
  const router = express.Router()

  router.use('/interactions', rateLimit({
    windowMs: 10 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false, 
  }))

  router.get('/', async (req, res) => {
    return res.render('index');
  })

  router.get('/interactions', async (req, res) => {
    return res.render('interactions')
  })

  router.post('/interactions', async (req, res) => {
    const intType = maybeStr(req.body.submit) ?? undefined
    const handle = maybeStr(req.body.handle)?.replace(/^@/g, '').trim() ?? ''
    if (!intType || handle.length === 0) {
      return res.render('interactions')
    }
    const timeCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)

    const user = await getProfile(ctx, handle)
    if (!user) {
      return res.render('interactions', { handle: '', errorText: `User not found: "${handle}"`})
    }

    if (intType === 'Table') {  
      const interactions = await getInteractions(ctx, user, 30, timeCutoff)
      if (!!interactions) {
        return res.render('interactions', { handle: handle, interactions: interactions})
      }
    }

    if (intType === 'Circles') {
      const lastCircles = await ctx.db
      .selectFrom('circles')
      .selectAll()
      .where('did', '=', user.did)
      .executeTakeFirst()

      if (!!lastCircles && lastCircles.updatedAt > new Date(Date.now() - 6 * 3600 * 1000).toISOString()) {
        res.writeHead(200, {
          "Content-Type": "image/png",
        });
        return res.end(Buffer.from(lastCircles.image));
      } else {
        const interactions = await getInteractions(ctx, user, 8+15, timeCutoff)
        if (!!interactions) {
          const circlesImage = (await getCircles(interactions)).toBuffer("image/png")
          await ctx.db
          .replaceInto('circles')
          .values({
            did: interactions.user.did,
            updatedAt: new Date().toISOString(),
            image: circlesImage
          })
          .execute()
          res.writeHead(200, {
            "Content-Type": "image/png",
          });
          return res.end(circlesImage);
        }
      }
    }
    return res.render('interactions')
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
      .where(({or, cmpr}) => or([
        cmpr('did', '=', handle),
        cmpr('handle', '=', handle),
        cmpr('handle', '=', `${handle}.bsky.social`),
      ]))
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
