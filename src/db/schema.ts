export type DatabaseSchema = {
  profiles: Profile
  posts: Post
  blocks: Block
  lists: List
  follows: Follow
  likes: Like
  reposts: Repost
  licks: Lick
  circles: Circle
  derived_data: DerivedData
  wolfgang_sub_state: SubState
}

export type DerivedData = {
  name: string
  data: string
  updatedAt: string
}

export type Lick = {
  uri: string
  author: string
  indexedAt: string
}

export type Languages = {
  [key : string] : number
}[]

export type Profile = {
  did: string
  handle: string | null
  displayName: string | null
  avatar: string | null
  description: string | null
  indexedAt: string
  updatedAt: string | null
  lastActivity: string | null
}

export type Post = {
  uri: string
  cid: string
  author: string
  replyParent: string | null
  replyRoot: string | null
  quoteUri: string | null
  languages: Languages | null
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
  cid: string | undefined
  author: any
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

export type Circle = {
  did: string
  interactions: string | {[key : string]: string | number}[]
  image: Buffer | null
  updatedAt: string | null
  lastCreatedAt: string | null
}

export type SubState = {
  service: string
  cursor: number
}
