import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    const newUnfollows = ops.follows.deletes.filter(unfollow => this.ctx.followers.map(x => x.uri).includes(unfollow.uri))
    const newFollows = ops.follows.creates.filter(follow => follow.record.subject === this.ctx.cfg.bskyIdentifier)
    if (newFollows.length > 0) {
      newFollows.forEach(follower => {
        this.ctx.api.follow(follower.author)
        this.ctx.followers.push({uri: follower.uri, author: follower.author})
        console.log(`Following ${follower.author}`)
      })
    }
    if (newUnfollows.length > 0) {
      newUnfollows.forEach(follower => {
        this.ctx.api.deleteFollow(follower.uri)
        this.ctx.followers = this.ctx.followers.filter(f => f.uri !== follower.uri)
        console.log(`Unfollowing ${follower.uri.split('/')[2]}`)
      })
    }

    const postsToCreate = ops.posts.creates.map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        author: create.author,
        text: create.record.text,
        replyParent: create.record?.reply?.parent.uri ?? null,
        replyRoot: create.record?.reply?.root.uri ?? null,
      }
    })

    if (postsToCreate.length > 0) {
      
    }
  }
}
