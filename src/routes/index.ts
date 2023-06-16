import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'
import { createCanvas, loadImage } from 'canvas'
import rateLimit from 'express-rate-limit'

import * as dData from '../derived_data'

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

function hex_is_light(color: string) {
  const hex = color.replace('#', '');
  const c_r = parseInt(hex.substring(0, 0 + 2), 16);
  const c_g = parseInt(hex.substring(2, 2 + 2), 16);
  const c_b = parseInt(hex.substring(4, 4 + 2), 16);
  const brightness = ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
  return brightness > 155;
}

const DO_NOT_INCLUDE_THESE = [
  'did:plc:xxno7p4xtpkxtn4ok6prtlcb', // @lovefairy.nl
  'did:plc:db645kt5coo7teuoxdjhq34x', // @blueskybaddies.bsky.social
]

type CirclesOptions = {
  locale: string
  bg_color: string
  remove_bots: boolean
  only_mine: boolean
}

type Interactions = {
  did: string
  handle: string
  displayName: string
  avatar: string
  commentsGiven: number
  quotesGiven: number
  likesGiven: number
  charactersGiven: number
  totalGiven: number
  commentsReceived: number
  quotesReceived: number
  likesReceived: number
  charactersReceived: number
  totalReceived: number
  total: number
}[]

const getCircles = async (ctx: AppContext, profile: any, interactions: Interactions, options: CirclesOptions) => {
  let filtered_interactions = interactions;
  if (options.only_mine) {
    filtered_interactions = filtered_interactions.sort((a, b) => {
      return (b.totalGiven as number) - (a.totalGiven as number);
    });
  }
  if (options.remove_bots) {
    filtered_interactions = filtered_interactions.filter(x => !DO_NOT_INCLUDE_THESE.includes(x.did as string))
  }

  const layers = [8, 15];
  const config = [
    {distance: 0, count: 1, radius: 110, users: [profile]},
    {distance: 200, count: layers[0], radius: 64, users: filtered_interactions.slice(0, 8)},
    {distance: 330, count: layers[1], radius: 58, users: filtered_interactions.slice(8)},
    // {distance: 450, count: layers[2], radius: 50, users: interactions.table.slice(8+15)}, // 26
  ]

  const width = 800;
  const height = 800;

  const canvas = createCanvas(width, height);
  const cctx = canvas.getContext("2d");

  // fill the background
  cctx.fillStyle = options.bg_color;
  cctx.fillRect(0, 0, width, height);

  // Date from and to
  const textFrom = new Date(Date.now() - 7 * 24 * 3600 * 1000).toLocaleDateString(options.locale, { day: 'numeric', month: 'numeric' })
  const textTo = new Date().toLocaleDateString(options.locale, { day: 'numeric', month: 'numeric' })
  const textFull = `${textFrom} - ${textTo}`
  const textColor = hex_is_light(options.bg_color) ? '#000000' : '#CCCCCC';
  cctx.font = '16px Garamond'
  cctx.fillStyle = textColor
  cctx.fillText(textFull, 10, 20)

  cctx.font = '16px Garamond'
  cctx.fillStyle = textColor
  cctx.fillText('wolfgang.raios.xyz', 640, 20)

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

      try {
        if (users[i].avatar) {
          const img = await loadImage(users[i].avatar as string)
          cctx.drawImage(
            img,
            centerX - radius,
            centerY - radius,
            radius * 2,
            radius * 2
          );
        } else {
          const img = await loadImage(defaultAvatarUrl)
          cctx.drawImage(
            img,
            centerX - radius,
            centerY - radius,
          );
        }
      }
      catch (e: any) {
        try {
          const profile = await ctx.api.getProfile({ actor: users[i].did } )
          if (profile?.data.avatar) {
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

            const img = await loadImage(profile.data.avatar)
            cctx.drawImage(
              img,
              centerX - radius,
              centerY - radius,
              radius * 2,
              radius * 2
            );
            ctx.log(`Error: ${e.message} - updated avatar`)
          } else {
            const img = await loadImage(defaultAvatarUrl)
            cctx.drawImage(
              img,
              centerX - radius,
              centerY - radius,
            );
          }
        }
        catch (e2: any) {
          ctx.log(`Final error: ${e2.message} - using default`)
          const img = await loadImage(defaultAvatarUrl)
          cctx.drawImage(
            img,
            centerX - radius,
            centerY - radius,
          );
        }
      }

      cctx.restore();
    }
  }
  ctx.log(`figure done: @${profile.handle}`)

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

const getInteractionsData = async (ctx: AppContext, profile: any, limit: number, timeCutoff: string) => {
  const lastCircles = await ctx.db
  .selectFrom('circles')
  .select(['updatedAt', 'interactions'])
  .where('did', '=', profile.did)
  .executeTakeFirst()

  if (!!lastCircles && !!lastCircles.interactions && lastCircles.interactions.length > 0 && !!lastCircles.updatedAt && lastCircles.updatedAt > new Date(Date.now() - 6 * 3600 * 1000).toISOString()) {
    ctx.log(`Found current interactions of ${profile.did}: @${profile.handle}`)
    return {interactions: lastCircles.interactions, updatedAt: lastCircles.updatedAt }
  }

  if (!!profile) {
      ctx.log(`Searching ${limit} interactions of ${profile.did}: @${profile.handle}`)
      const queryTable = await ctx.db
      .with('commentsGivenTable', (db) => db
          .selectFrom('posts')
          .where('author', '=', profile.did)
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
          .where('replyParent', 'like', `at://${profile.did}%`)
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
          .where('author', '=', profile.did)
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
          .where('quoteUri', 'like', `at://${profile.did}%`)
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
          .where('uri', 'like', `at://${profile.did}%`)
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
          .where('subjectUri', 'like', `at://${profile.did}%`)
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
          .where('uri', 'like', `at://${profile.did}%`)
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
          .where('subjectUri', 'like', `at://${profile.did}%`)
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
      .where('profiles.did', '!=', profile.did)
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

      ctx.log(`search done: @${profile.handle}`)

      await ctx.db
      .replaceInto('circles')
      .values({
        did: profile.did,
        interactions: JSON.stringify(queryTable),
        updatedAt: new Date().toISOString(),
      })
      .execute()

      return {interactions: queryTable, updatedAt: new Date().toISOString() }
  }
  return undefined
}

const toRad = (x: number) => x * (Math.PI / 180);

export default function (ctx: AppContext) {
  const router = express.Router()

  const interactionsLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false, 
  })

  const blocksLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false, 
  })

  router.get('/', async (req, res) => {
    return res.render('index');
  })

  router.get('/interactions', async (req, res) => {
    return res.render('interactions')
  })

  router.post('/interactions', interactionsLimit, async (req, res) => {
    const intType = maybeStr(req.body.submit) ?? undefined
    const handle = maybeStr(req.body.handle)?.replace(/^@/g, '').trim() ?? ''

    if (!intType || handle.length === 0) {
      return res.render('interactions')
    }
    const timeCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)

    const profile = await getProfile(ctx, handle)
    if (!profile) {
      return res.render('interactions', { handle: '', errorText: `User not found: "${handle}"`})
    }

    if (intType === 'Search') {  
      const interactions_data = await getInteractionsData(ctx, profile, 40, timeCutoff)
      const list_of_bots = DO_NOT_INCLUDE_THESE.map(did => (
        `<a target='_blank' href="https://bsky.app/profile/${did}">
          ${did}
          <i class="bi bi-box-arrow-up-right"></i>
         </a>
        `
      )).join('\n')
      if (!!interactions_data) {
        return res.render('interactions', { 
          handle: handle, 
          profile: profile, 
          interactions: interactions_data.interactions,
          updatedAt: interactions_data.updatedAt,
          list_of_bots: list_of_bots 
        })
      }
    }

    if (intType === 'Circles') {
      const interactions_data = await getInteractionsData(ctx, profile, 40, timeCutoff)

      const circlesOptions = {
        bg_color: req.body.bg_color ?? '#000000',
        only_mine: req.body.only_mine ?? false,
        remove_bots: req.body.remove_bots ?? true,
        //@ts-ignore
        locale: req.getLocale() ?? req.locale ?? 'en'
      }

      if (!!interactions_data) {
        const circlesImage = await getCircles(ctx, profile, interactions_data.interactions, circlesOptions)
        const imageBuffer = circlesImage.toBuffer("image/png")
        // await ctx.db
        // .updateTable('circles')
        // .set({
        //   image: circlesImage,
        //   lastCreatedAt: new Date().toISOString(),
        // })
        // .where('did', '=', user.did)
        // .execute()
        res.writeHead(200, {
          "Content-Type": "image/png",
        });
        return res.end(imageBuffer);
      }
      // const lastCircles = await ctx.db
      // .selectFrom('circles')
      // .selectAll()
      // .where('did', '=', user.did)
      // .executeTakeFirst()

      // if (!!lastCircles && lastCircles.updatedAt > new Date(Date.now() + 6 * 3600 * 1000).toISOString()) {
      //   res.writeHead(200, {
      //     "Content-Type": "image/png",
      //   });
      //   return res.end(Buffer.from(lastCircles.image));
      // } else {
      // }
    }
    return res.render('interactions')
  })

  // router.get('/blocks', blocksLimit, async (req, res) => {
  //   return res.render('blocks')
    // const handle = maybeStr(req.query.handle)?.replace(/^@/g, '').trim()

    // let userFound = false
    // let textVal = ''
    // let blocks = {}

    // if (handle && handle.length > 0) {
    //   const user = await ctx.db
    //   .selectFrom('profiles')
    //   .select(['did', 'handle'])
    //   .where('handle', '=', handle)
    //   .where(({or, cmpr}) => or([
    //     cmpr('did', '=', handle),
    //     cmpr('handle', '=', handle),
    //     cmpr('handle', '=', `${handle}.bsky.social`),
    //   ]))
    //   .limit(1)
    //   .executeTakeFirst()

    //   if (!!user) {
    //     ctx.log(`Searching blocks of ${user.did}: @${user.handle}`)
    //     userFound = true
    //     textVal = ''

    //     blocks = await ctx.db
    //     .selectFrom('blocks')
    //     .innerJoin('profiles', 'profiles.did', 'blocks.author')
    //     .select(['did', 'handle', 'displayName', 'blocks.indexedAt'])
    //     .where('subject', '=', user.did)
    //     .orderBy('indexedAt', 'desc')
    //     .execute()
    //   } else {
    //     userFound = false
    //     textVal = `User not found: "${handle}"`
    //   }
    // }

    // return res.render('blocks', { handle: handle, userFound: userFound, textVal: textVal, blocks: blocks });
  // })

  router.get('/update/:name/:value?', async (req, res) => {
    ctx.log(`request @ /update/${req.params.name}/${req.params.value} from ${req.ip}`)
    if (!['127.0.0.1', '::1'].includes(req.ip)) {
      res.end()
    }
    
    if (req.params.name === 'follows') {
      await dData.updateTopFollowed(ctx)
      res.send('done!')
    }

    if (req.params.name === 'blocks') {
      await dData.updateTopBlocked(ctx)
      res.send('done!')
    }

    if (req.params.name === 'profile') {
      if (!!req.params.value) {
        const profile = await dData.updateProfile(ctx, req.params.value)
        if (!!profile) {
          res.json(profile)
        } else {
          res.send('error getting profile')
        }
      } else {
        res.send('no value given')
      }
    }

    res.end()
  })

  router.get('/top_followed', async (req, res) => {
    const query = await ctx.db
    .selectFrom('derived_data')
    .select(['data', 'updatedAt'])
    .where('name', '=', 'top_follows')
    .executeTakeFirst()

    return res.render('topFollows', { query: query });
  })

  router.get('/top_blocked', async (req, res) => {
    const query = await ctx.db
    .selectFrom('derived_data')
    .select(['data', 'updatedAt'])
    .where('name', '=', 'top_blocks')
    .executeTakeFirst()

    return res.render('topBlocks', { query: query });
  })

  return router
}
