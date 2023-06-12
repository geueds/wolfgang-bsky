import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'
import { createCanvas, loadImage } from 'canvas'

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

const getInteractions = async (ctx: AppContext, handle: string, limit: number, timeCutoff: string) => {
  const user = await ctx.db
  .selectFrom('profiles')
  .select(['did', 'handle', 'displayName', 'avatar'])
  .where('handle', '=', handle)
  .limit(1)
  .executeTakeFirst()

  if (!!user) {
      console.log(`Searching interactions of ${user.did}: @${user.handle}`)

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
          .limit(limit)
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
          .limit(limit)
      )
      .with('repostsTable', (db) => db
          .selectFrom('reposts')
          .where('uri', 'like', `at://${user.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([sql`SUBSTR(reposts.subjectUri, 6, 32)`.as('did'), sql`count(*)`.as('repostsGiven')])
          .groupBy('did')
          .limit(limit)
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
          .limit(limit)
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
      .limit(limit)
      .execute()

      console.log(`done 1: ${user.did}`)

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
          .limit(limit)
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
          .limit(limit)
      )
      .with('repostsTable', (db) => db
          .selectFrom('reposts')
          .where('subjectUri', 'like', `at://${user.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([sql`SUBSTR(reposts.uri, 6, 32)`.as('did'), sql`count(*)`.as('repostsReceived')])
          .groupBy('did')
          .limit(limit)
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
          .limit(limit)
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
      .limit(limit)
      .execute()

      console.log(`done 2: ${user.did}`)

      const mergedTables = [
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
      .slice(0, limit)

      console.log(`done 3: ${user.did}`)

      return {user: user, withMe: withMe, withOthers: withOthers, merged: mergedTables}
  }
  return undefined
}

const toRad = (x: number) => x * (Math.PI / 180);

export default function (ctx: AppContext) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    return res.render('index');
  })

  router.get('/interactions', async (req, res) => {
    return res.render('interactions')
  })

  router.post('/interactions', async (req, res) => {
    const handle = maybeStr(req.body.handle)?.replace(/^@/g, '').trim()
    const timeCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const interactions = await getInteractions(ctx, handle, 25, timeCutoff)

    if (!!interactions) {
      return res.render('interactions', { handle: handle, interactions: interactions });
    }
    return res.render('interactions', { handle: handle, errorText: `User not found: "${handle}"`})
  })

  router.post('/circles', async (req, res) => {
    const handle = maybeStr(req.body.handle)?.replace(/^@/g, '').trim()
    const timeCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const interactions = await getInteractions(ctx, handle, 8+15, timeCutoff)
    if (!interactions) {
      return res.send(`User not found: "${handle}"`);
    }

    const layers = [8, 15];

    const config = [
      {distance: 0, count: 1, radius: 110, users: [interactions.user]},
      {distance: 200, count: layers[0], radius: 64, users: interactions.merged.slice(0, 8)},
      {distance: 330, count: layers[1], radius: 58, users: interactions.merged.slice(8)},
      // {distance: 450, count: layers[2], radius: 50, users: interactions.merged.slice(8+15)},
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

    console.log(`done 4: ${handle}`)

    res.writeHead(200, {
        "Content-Type": "image/png",
    });
    res.end(canvas.toBuffer("image/png"));
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
