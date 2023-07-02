import express from 'express'
import { AppContext } from '../config'
import { sql } from 'kysely'
import { createCanvas, loadImage } from 'canvas'
import rateLimit from 'express-rate-limit'
import { 
  AppBskyEmbedImages, 
  AppBskyEmbedRecordWithMedia, 
  AppBskyEmbedRecord,
  AppBskyFeedPost,
} from '@atproto/api'
import { getProfile } from './index'
import { maybeStr } from '../index'
import { getDateTime } from '../derived_data'

function hex_is_light(color: string) {
  const hex = color.replace('#', '')
  const c_r = parseInt(hex.substring(0, 0 + 2), 16)
  const c_g = parseInt(hex.substring(2, 2 + 2), 16)
  const c_b = parseInt(hex.substring(4, 4 + 2), 16)
  const brightness = (c_r * 299 + c_g * 587 + c_b * 114) / 1000
  return brightness > 155
}

const DO_NOT_INCLUDE_THESE = [
  'did:plc:xxno7p4xtpkxtn4ok6prtlcb', // @lovefairy.nl
  'did:plc:db645kt5coo7teuoxdjhq34x', // @blueskybaddies.bsky.social
  'did:plc:y4rd5hesgwwbkblvkkidfs73', // @wolfgang
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

const getCircles = async (
  ctx: AppContext,
  profile: any,
  interactions: Interactions,
  options: CirclesOptions,
) => {
  let filtered_interactions = interactions
  if (options.only_mine) {
    filtered_interactions = filtered_interactions.sort((a, b) => {
      return (b.totalGiven as number) - (a.totalGiven as number)
    })
  }
  if (options.remove_bots) {
    filtered_interactions = filtered_interactions.filter(
      (x) => !DO_NOT_INCLUDE_THESE.includes(x.did as string),
    )
  }

  const layers = [8, 15]
  const config = [
    { distance: 0, count: 1, radius: 110, users: [profile] },
    {
      distance: 200,
      count: layers[0],
      radius: 64,
      users: filtered_interactions.slice(0, 8),
    },
    {
      distance: 330,
      count: layers[1],
      radius: 58,
      users: filtered_interactions.slice(8),
    },
    // {distance: 450, count: layers[2], radius: 50, users: interactions.table.slice(8+15)}, // 26
  ]

  const width = 800
  const height = 800

  const canvas = createCanvas(width, height)
  const cctx = canvas.getContext('2d')

  // fill the background
  cctx.fillStyle = options.bg_color
  cctx.fillRect(0, 0, width, height)

  // Date from and to
  const textFrom = new Date(
    Date.now() - 7 * 24 * 3600 * 1000,
  ).toLocaleDateString(options.locale, { day: 'numeric', month: 'numeric' })
  const textTo = new Date().toLocaleDateString(options.locale, {
    day: 'numeric',
    month: 'numeric',
  })
  const textFull = `${textFrom} - ${textTo}`
  const textColor = hex_is_light(options.bg_color) ? '#000000' : '#CCCCCC'
  cctx.font = '16px Garamond'
  cctx.fillStyle = textColor
  cctx.fillText(textFull, 10, 20)

  cctx.font = '16px Garamond'
  cctx.fillStyle = textColor
  cctx.fillText('wolfgang.raios.xyz', 640, 20)

  // loop over the layers
  for (const [layerIndex, layer] of config.entries()) {
    const { count, radius, distance, users } = layer

    const angleSize = 360 / count

    // loop over each circle of the layer
    for (let i = 0; i < count; i++) {
      // We need an offset or the first circle will always on the same line and it looks weird
      // Try removing this to see what happens
      const offset = layerIndex * 30

      // i * angleSize is the angle at which our circle goes
      // We need to converting to radiant to work with the cos/sin
      const r = toRad(i * angleSize + offset)

      const centerX = Math.cos(r) * distance + width / 2
      const centerY = Math.sin(r) * distance + height / 2

      // if we are trying to render a circle but we ran out of users, just exit the loop. We are done.
      if (!users[i]) break

      cctx.save()
      cctx.beginPath()
      cctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
      cctx.clip()

      const defaultAvatarUrl = 'src/routes/person-fill.svg'

      try {
        if (users[i].avatar) {
          const img = await loadImage(users[i].avatar as string)
          cctx.drawImage(
            img,
            centerX - radius,
            centerY - radius,
            radius * 2,
            radius * 2,
          )
        } else {
          const img = await loadImage(defaultAvatarUrl)
          cctx.drawImage(img, centerX - radius, centerY - radius)
        }
      } catch (e: any) {
        try {
          const profile = await ctx.api.getProfile({ actor: users[i].did })
          if (profile?.data.avatar) {
            await ctx.db
              .updateTable('profiles')
              .set({
                handle: profile.data.handle,
                displayName: profile.data.displayName,
                avatar: profile.data.avatar ?? null,
                description: profile.data.description ?? null,
                updatedAt: getDateTime(),
              })
              .where('did', '=', profile.data.did)
              .execute()

            const img = await loadImage(profile.data.avatar)
            cctx.drawImage(
              img,
              centerX - radius,
              centerY - radius,
              radius * 2,
              radius * 2,
            )
            ctx.log(`[interactions] ERROR: ${e.message} - updated avatar`)
          } else {
            const img = await loadImage(defaultAvatarUrl)
            cctx.drawImage(img, centerX - radius, centerY - radius)
          }
        } catch (e2: any) {
          ctx.log(`[interactions] ERROR: ${e2.message} - using default`)
          const img = await loadImage(defaultAvatarUrl)
          cctx.drawImage(img, centerX - radius, centerY - radius)
        }
      }

      cctx.restore()
    }
  }
  ctx.log(`[interactions] figure done: @${profile.handle}`)

  return canvas
}

const getInteractionsData = async (
  ctx: AppContext,
  profile: any,
  limit: number,
  timeCutoff: string,
) => {
  const lastCircles = await ctx.db
    .selectFrom('circles')
    .select(['updatedAt', 'interactions'])
    .where('did', '=', profile.did)
    .executeTakeFirst()

  if (
    !!lastCircles &&
    !!lastCircles.interactions &&
    lastCircles.interactions.length > 0 &&
    !!lastCircles.updatedAt &&
    lastCircles.updatedAt > getDateTime(Date.now() - 2 * 3600 * 1000)
  ) {
    ctx.log(
      `[interactions] Found current interactions of ${profile.did}: @${profile.handle}`,
    )
    return {
      interactions: lastCircles.interactions,
      updatedAt: lastCircles.updatedAt,
    }
  }

  if (!!profile) {
    ctx.log(
      `[interactions] Searching ${limit} interactions of ${profile.did}: @${profile.handle}`,
    )
    const queryTable = await ctx.db
      .with('commentsGivenTable', (db) =>
        db
          .selectFrom('posts')
          .where('author', '=', profile.did)
          .where('indexedAt', '>', timeCutoff)
          .select([
            sql`SUBSTR(posts.replyParent, 6, 32)`.as('did'),
            sql`SUM(textLength)`.as('charactersGiven'),
            sql`count(uri)`.as('commentsGiven'),
          ])
          .groupBy('did')
          .orderBy('commentsGiven', 'desc'),
      )
      .with('commentsReceivedTable', (db) =>
        db
          .selectFrom('posts')
          .where('replyParent', 'like', `at://${profile.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
            sql`author`.as('did'),
            sql`SUM(textLength)`.as('charactersReceived'),
            sql`count(uri)`.as('commentsReceived'),
          ])
          .groupBy('did')
          .orderBy('commentsReceived', 'desc'),
      )
      .with('quotesGivenTable', (db) =>
        db
          .selectFrom('posts')
          .where('author', '=', profile.did)
          .where('indexedAt', '>', timeCutoff)
          .select([
            sql`SUBSTR(posts.quoteUri, 6, 32)`.as('did'),
            sql`count(uri)`.as('quotesGiven'),
          ])
          .groupBy('did')
          .orderBy('quotesGiven', 'desc'),
      )
      .with('quotesReceivedTable', (db) =>
        db
          .selectFrom('posts')
          .where('quoteUri', 'like', `at://${profile.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([sql`author`.as('did'), sql`count(uri)`.as('quotesReceived')])
          .groupBy('did')
          .orderBy('quotesReceived', 'desc'),
      )
      .with('repostsGivenTable', (db) =>
        db
          .selectFrom('reposts')
          .where('uri', 'like', `at://${profile.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
            sql`SUBSTR(reposts.subjectUri, 6, 32)`.as('did'),
            sql`count(uri)`.as('repostsGiven'),
          ])
          .groupBy('did')
          .orderBy('repostsGiven', 'desc'),
      )
      .with('repostsReceivedTable', (db) =>
        db
          .selectFrom('reposts')
          .where('subjectUri', 'like', `at://${profile.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
            sql`SUBSTR(reposts.uri, 6, 32)`.as('did'),
            sql`count(uri)`.as('repostsReceived'),
          ])
          .groupBy('did')
          .orderBy('repostsReceived', 'desc'),
      )
      .with('likesGivenTable', (db) =>
        db
          .selectFrom('likes')
          .where('uri', 'like', `at://${profile.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
            sql`SUBSTR(likes.subjectUri, 6, 32)`.as('did'),
            sql`count(uri)`.as('likesGiven'),
          ])
          .groupBy('did')
          .orderBy('likesGiven', 'desc'),
      )
      .with('likesReceivedTable', (db) =>
        db
          .selectFrom('likes')
          .where('subjectUri', 'like', `at://${profile.did}%`)
          .where('indexedAt', '>', timeCutoff)
          .select([
            sql`SUBSTR(likes.uri, 6, 32)`.as('did'),
            sql`count(uri)`.as('likesReceived'),
          ])
          .groupBy('did')
          .orderBy('likesReceived', 'desc'),
      )
      .selectFrom('profiles')
      .leftJoin('commentsGivenTable', 'commentsGivenTable.did', 'profiles.did')
      .leftJoin(
        'commentsReceivedTable',
        'commentsReceivedTable.did',
        'profiles.did',
      )
      .leftJoin('quotesGivenTable', 'quotesGivenTable.did', 'profiles.did')
      .leftJoin(
        'quotesReceivedTable',
        'quotesReceivedTable.did',
        'profiles.did',
      )
      .leftJoin('repostsGivenTable', 'repostsGivenTable.did', 'profiles.did')
      .leftJoin(
        'repostsReceivedTable',
        'repostsReceivedTable.did',
        'profiles.did',
      )
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
        sql`(IFNULL(commentsGiven, 0) + IFNULL(quotesGiven, 0) + IFNULL(repostsGiven, 0) + IFNULL(likesGiven, 0))`.as(
          'totalGiven',
        ),
        sql`(IFNULL(commentsReceived, 0) + IFNULL(quotesReceived, 0) + IFNULL(repostsReceived, 0) + IFNULL(likesReceived, 0))`.as(
          'totalReceived',
        ),
        sql`(IFNULL(commentsGiven, 0) + IFNULL(quotesGiven, 0) + IFNULL(repostsGiven, 0) + IFNULL(likesGiven, 0) + IFNULL(commentsReceived, 0) + IFNULL(quotesReceived, 0) + IFNULL(repostsReceived, 0) + IFNULL(likesReceived, 0))`.as(
          'total',
        ),
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
      .having(({ or, cmpr }) =>
        or([
          cmpr('commentsGiven', '>', 0),
          cmpr('quotesGiven', '>', 0),
          cmpr('repostsGiven', '>', 0),
          cmpr('likesGiven', '>', 0),
          cmpr('commentsReceived', '>', 0),
          cmpr('quotesReceived', '>', 0),
          cmpr('repostsReceived', '>', 0),
          cmpr('likesReceived', '>', 0),
        ]),
      )
      .limit(limit)
      .execute()

    ctx.log(`[interactions] search done: @${profile.handle}`)

    await ctx.db
      .replaceInto('circles')
      .values({
        did: profile.did,
        interactions: JSON.stringify(queryTable),
        updatedAt: getDateTime(),
      })
      .execute()

    return { interactions: queryTable, updatedAt: getDateTime() }
  }
  return undefined
}

const toRad = (x: number) => x * (Math.PI / 180)

async function getAllPosts(ctx: AppContext, repo: string) {
  let cursor: any = ''
  let currit: number = 0
  let list: any[] = []
  do {
    currit++
    const response = await ctx.api.com.atproto.repo.listRecords({
      repo: repo,
      collection: 'app.bsky.feed.post',
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
  } while (cursor !== null && currit < 5)
  return list
}

async function syncPosts(ctx: AppContext, repo: string) {
  const posts = await getAllPosts(ctx, repo)

  const postsToUpdate = posts.map(post => {
    let hasImages = 0;
    let quoteUri : string | null = null;

    if (AppBskyFeedPost.isRecord(post.value)) {
      // post with images
      if (AppBskyEmbedImages.isMain(post.value.embed)) {
        hasImages = post.value.embed.images.length
      }

      // text-only post quoting a post
      if (AppBskyEmbedRecord.isMain(post.value.embed)) {
        quoteUri = post.value.embed.record.uri
      }
      
      // post with media quoting a post
      if (AppBskyEmbedRecordWithMedia.isMain(post.value.embed)) {
        if (AppBskyEmbedRecord.isMain(post.value.embed.record)) {
          quoteUri = post.value.embed.record.record.uri
        }
        if (AppBskyEmbedImages.isMain(post.value.embed.media)) {
          hasImages = post.value.embed.media.images.length
        }
      }
    }

    return {
      uri: post.uri,
      cid: post.cid,
      author: post.uri.split('/')[2],
      replyParent: post.value?.reply?.parent.uri ?? null,
      replyRoot: post.value?.reply?.root.uri ?? null,
      quoteUri: quoteUri ?? null,
      hasImages: hasImages,
      textLength: post.value?.text.length,
      indexedAt: post.value?.createdAt,
    }

  })

  if (postsToUpdate.length > 0) {
    for (const post of postsToUpdate) {
      await ctx.db
      .replaceInto('posts')
      .values(post)
      .execute()
    }
  }
}

export default function (ctx: AppContext) {
  const router = express.Router()

  const interactionsLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
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
    const timeCutoff = getDateTime(Date.now() - 7 * 24 * 3600 * 1000)

    const profile = await getProfile(ctx, handle)
    if (!profile) {
      return res.render('interactions', {
        handle: '',
        errorText: `User not found: "${handle}"`,
      })
    }

    if (intType === 'Search') {
      ctx.log(`[interactions] ${req.headers["user-agent"]}`)
      const interactions_data = await getInteractionsData(
        ctx,
        profile,
        40,
        timeCutoff,
      )
      const list_of_bots = DO_NOT_INCLUDE_THESE.map(
        (did) =>
          `<a target='_blank' href="https://bsky.app/profile/${did}">
          ${did}
          <i class="bi bi-box-arrow-up-right"></i>
         </a>
        `,
      ).join('\n')
      if (!!interactions_data) {
        return res.render('interactions', {
          handle: handle,
          profile: profile,
          interactions: interactions_data.interactions,
          updatedAt: interactions_data.updatedAt,
          list_of_bots: list_of_bots,
        })
      }
    }

    if (intType === 'Circles') {
      const interactions_data = await getInteractionsData(
        ctx,
        profile,
        40,
        timeCutoff,
      )

      const circlesOptions = {
        bg_color: req.body.bg_color ?? '#000000',
        only_mine: req.body.only_mine ?? false,
        remove_bots: req.body.remove_bots ?? true,
        //@ts-ignore
        locale: req.getLocale() ?? req.locale ?? 'en',
      }

      if (!!interactions_data) {
        const circlesImage = await getCircles(
          ctx,
          profile,
          interactions_data.interactions as Interactions,
          circlesOptions,
        )
        const imageBuffer = circlesImage.toBuffer('image/png')
        // await ctx.db
        // .updateTable('circles')
        // .set({
        //   image: circlesImage,
        //   lastCreatedAt: new Date().toISOString(),
        // })
        // .where('did', '=', user.did)
        // .execute()
        res.writeHead(200, {
          'Content-Type': 'image/png',
        })
        return res.end(imageBuffer)
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

  return router
}
