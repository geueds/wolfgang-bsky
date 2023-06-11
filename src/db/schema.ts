export type DatabaseSchema = {
  profiles: Profile
  posts: Post
  blocks: Block
  lists: List
  follows: Follow
  likes: Like
  reposts: Repost
  wolfgang_sub_state: SubState
}

export type Profile = {
  did: string
  handle: string | null
  displayName: string | null
  description: string | null
  indexedAt: string
  updatedAt: string | null
}

export type Post = {
  uri: string
  cid: string
  author: string
  replyParent: string | null
  replyRoot: string | null
  quoteUri: string | null
  keywords: string | null
  hasImages: number
  textLength: number | null
  comments: number | null
  reposts: number | null
  likes: number | null
  indexedAt: string
}

export type Block = {
  uri: string
  cid: string
  author: string
  subject: string
  indexedAt: string
}

export type Follow = {
  uri: string
  cid: string
  author: string
  subject: string
  indexedAt: string
}

export type Like = {
  uri: string
  cid: string
  subjectUri: string
  subjectCid: string
  indexedAt: string
}

export type Repost = {
  uri: string
  cid: string
  subjectUri: string
  subjectCid: string
  indexedAt: string
}

export type List = {
  owner: string
  type: string
  list: string
  showReplies: boolean
  showImages: boolean
  indexedAt: string
}

export type SubState = {
  service: string
  cursor: number
}
