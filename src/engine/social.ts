/** 本地道友关系。[重建] NPC 自动接受护法/入派，名称、名单和外交均入档；道源不等于门派。
 * 原版依据：news/gonggao-xz-2008-11-26-652、third-party/17173-webxz-system、threads-unknown/82051-p1。
 */
import type { GameState, MailItem } from './state.ts'

export type Guild = {
  readonly id: number; readonly name: string; readonly founder: number; readonly leader: number
  readonly createdAt: number; readonly members: readonly number[]
  readonly jobs: Readonly<Record<number, string>>
  readonly allies: readonly number[]; readonly enemies: readonly number[]
}
export type SocialState = {
  readonly guardians: readonly number[]
  readonly npcGuardians: Readonly<Record<number, readonly number[]>>
  readonly guilds: readonly Guild[]
  readonly blacklist: readonly string[]
}
type Result = { readonly ok: true; readonly state: GameState } | { readonly ok: false; readonly reason: string }
const fail = (reason: string): Result => ({ ok: false, reason })
export const GUARDIAN_CAP = 7

export function socialOf(s: GameState): SocialState {
  if (s.social) return s.social
  const ids = s.npc.bases.map(n => n.id)
  // ponytail: 固定三家 NPC 门派；规模扩展时再加入 NPC 自建/解散，避免每次渲染重新分配。
  const guilds = ['青云会', '明月楼', '松风阁'].map((name, i): Guild => {
    const members = ids.slice(i * 10, i * 10 + 10)
    return { id: i + 1, name, founder: members[0] ?? 0, leader: members[0] ?? 0, createdAt: 0,
      members, jobs: {}, allies: [], enemies: [] }
  }).filter(g => g.members.length)
  return { guardians: [], blacklist: [], guilds,
    npcGuardians: Object.fromEntries(ids.map((id, i) => [id, ids.slice(i + 1, i + 3)])) }
}
export function guildOf(s: GameState, member = 0): Guild | undefined {
  return socialOf(s).guilds.find(g => g.members.includes(member))
}
function update(s: GameState, social: SocialState, subject: string): Result {
  const mail: MailItem = { id: `social:${s.clock.gameT}:${s.mail.length}`, subject,
    from: '系统', at: s.clock.gameT, read: false, kind: 'system', body: { kind: 'text', paragraphs: [subject], guildId: guildOf({ ...s, social })?.id } }
  return { ok: true, state: { ...s, social, mail: [mail, ...s.mail].slice(0, 200) } }
}
export function changeGuardian(s: GameState, npcId: number, add: boolean): Result {
  const npc = s.npc.bases.find(n => n.id === npcId), social = socialOf(s)
  if (!npc) return fail('找不到这位道友')
  if (add && !social.guardians.includes(npcId) && social.guardians.length >= GUARDIAN_CAP) return fail('护法人数已满')
  const guardians = add ? [...new Set([...social.guardians, npcId])] : social.guardians.filter(id => id !== npcId)
  return update(s, { ...social, guardians }, `${add ? '与' : '解除与'}${npc.name}${add ? '结为护法' : '的护法关系'}`)
}
export function canRequestAid(s: GameState, npcId: number): boolean {
  return s.npc.bases.some(n => n.id === npcId) &&
    (socialOf(s).guardians.includes(npcId) || (guildOf(s)?.members.includes(npcId) ?? false))
}
export function createGuild(s: GameState, input: string): Result {
  const name = input.trim(), social = socialOf(s)
  if (guildOf(s)) return fail('请先退出当前门派')
  if (!name || name.length > 20 || social.guilds.some(g => g.name === name)) return fail('门派名须为 1 至 20 字且不能重复')
  const id = Math.max(0, ...social.guilds.map(g => g.id)) + 1
  return update(s, { ...social, guilds: [...social.guilds, { id, name, founder: 0, leader: 0,
    createdAt: s.clock.gameT, members: [0], jobs: {}, allies: [], enemies: [] }] }, `创建门派：${name}`)
}
export function joinGuild(s: GameState, id: number): Result {
  const social = socialOf(s), guild = social.guilds.find(g => g.id === id)
  if (guildOf(s)) return fail('请先退出当前门派')
  if (!guild) return fail('找不到这个门派')
  return update(s, { ...social, guilds: social.guilds.map(g => g.id === id ? { ...g, members: [...g.members, 0] } : g) }, `加入门派：${guild.name}`)
}
export function leaveGuild(s: GameState): Result {
  const social = socialOf(s), guild = guildOf(s)
  if (!guild) return fail('尚未加入门派')
  const members = guild.members.filter(id => id !== 0)
  return update(s, { ...social, guilds: social.guilds.map(g => g.id === guild.id
    ? { ...g, members, leader: g.leader === 0 ? members[0] ?? 0 : g.leader } : g)
    .filter(g => g.members.length).map(g => ({ ...g, allies: g.allies.filter(id => id !== guild.id || members.length > 0), enemies: g.enemies.filter(id => id !== guild.id || members.length > 0) })) }, `退出门派：${guild.name}`)
}
export function recruitGuildMember(s: GameState, npcId: number, job = '弟子'): Result {
  const social = socialOf(s), guild = guildOf(s)
  if (!guild || guild.leader !== 0) return fail('只有掌门可以招收和任命成员')
  if (!s.npc.bases.some(n => n.id === npcId) || !['弟子', '杀手', '护法', '长老'].includes(job)) return fail('成员或职位无效')
  if (guildOf(s, npcId) && guildOf(s, npcId)?.id !== guild.id) return fail('对方已加入其他门派')
  return update(s, { ...social, guilds: social.guilds.map(g => g.id === guild.id
    ? { ...g, members: [...new Set([...g.members, npcId])], jobs: { ...g.jobs, [npcId]: job } } : g) }, `门派任命：${s.npc.bases.find(n => n.id === npcId)!.name}（${job}）`)
}
export function setGuildRelation(s: GameState, id: number, relation: 'ally' | 'enemy' | 'neutral'): Result {
  const social = socialOf(s), guild = guildOf(s)
  if (!guild || guild.leader !== 0) return fail('只有掌门可以处理门派关系')
  if (guild.id === id || !social.guilds.some(g => g.id === id) || !['ally', 'enemy', 'neutral'].includes(relation)) return fail('门派关系无效')
  return update(s, { ...social, guilds: social.guilds.map(g => {
    if (g.id !== id && g.id !== guild.id) return g
    const other = g.id === id ? guild.id : id
    return { ...g, allies: [...g.allies.filter(n => n !== other), ...(relation === 'ally' ? [other] : [])],
      enemies: [...g.enemies.filter(n => n !== other), ...(relation === 'enemy' ? [other] : [])] }
  }) }, `门派关系调整：${relation === 'ally' ? '同盟' : relation === 'enemy' ? '敌对' : '中立'}`)
}
