import bsky from '@atproto/api';
import { cborToLexRecord, readCarWithRoot } from '@atproto/repo'
import { Subscription } from "@atproto/xrpc-server";
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import pkg from "@atproto/api";

dotenv.config();

const { BskyAgent } = bsky;
const { AtUri, RichText } = pkg;

const agent = new BskyAgent({
  service: 'https://bsky.social',
});

await agent.login({
  identifier: process.env.BSKY_USERNAME,
  password: process.env.BSKY_PASSWORD,
});

const sub = new Subscription({
  service: 'wss://bsky.social',
  method: "com.atproto.sync.subscribeRepos",
  validate: (body) => body,
});

const BLESSED_USERS = [
  'did:plc:5fkzoy5o6jn5lka7jiocngzs', // main
  'did:plc:y4rd5hesgwwbkblvkkidfs73', // cat
  'did:plc:zqnx5g75q5ygxxxmoqfdcpsc', // Uaba
  'did:plc:smipjkvf3jb2fnwr7umixae7', // Gisla
  'did:plc:i2newr2743d666m4af3venob', // hoffmann
]

const FROG_IMAGES = [
  'img/a.jpg',
  'img/b.jpg',
  'img/c.jpg',
  'img/d.jpg',
]

const stream = async () => {
  console.log("Listening...")
  for await (const commit of sub) {
    if (!(commit.blocks instanceof Uint8Array)) {
      continue;
    }
    const car = await readCarWithRoot(commit.blocks);
    const ops = [];
    commit.ops.forEach((op) => {
      if (op.action === 'create') {
        const [collection, rkey] = op.path.split("/");
        if (collection === 'app.bsky.feed.post') {
          const cid = op.cid;
          const record = car.blocks.get(cid);
          ops.push({
            action: op.action,
            cid: op.cid.toString(),
            record: cborToLexRecord(record),
            repo: commit.repo,
            blobs: [],
            uri: AtUri.make(commit.repo, collection, rkey).toString(),
          });
        }
      }

      ops.forEach((op) => {
        if (BLESSED_USERS.includes(op.repo)) {
          if (op.record.text.toLowerCase().includes('te amo')) {
            const rt = new RichText({text: '❤️'})
            rt.detectFacets(agent)

            const imgFile = FROG_IMAGES[Math.floor(Math.random() * FROG_IMAGES.length)]
            const imgStream = fs.createReadStream(imgFile)
            agent.uploadBlob(imgStream, {
              encoding: 'image/jpeg'
            })
            .then((response) => {
              if (response.success) {
                const postRecord = {
                    $type: 'app.bsky.feed.post',
                    text: rt.text,
                    facets: rt.facets,
                    createdAt: new Date().toISOString(),
                    embed: {
                      $type: 'app.bsky.embed.images',
                      "images": [{"image": response.data?.blob, "alt": "Te amo!"}]
                    },
                    reply: {
                      parent: { 
                        cid: op.cid, 
                        uri: op.uri 
                      },
                      root: { 
                        cid: op.reply?.root? op.reply.root.cid : op.cid, 
                        uri: op.reply?.root? op.reply.root.uri : op.uri
                      }
                    }
                }
                console.log("Posting in reply to: ", op.repo)
                agent.post(postRecord)
              }
            })
          } 
        }
      })
    })
  }
}

stream()
