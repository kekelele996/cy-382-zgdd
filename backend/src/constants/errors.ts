export const ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  TRIP_NOT_FOUND: 'TRIP_NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** 不是行程成员，无权查看该日记 */
  NOT_TRIP_MEMBER: 'NOT_TRIP_MEMBER',
  /** 已离队，成员离队后其段落仍可查看但不能再改 */
  MEMBER_LEFT: 'MEMBER_LEFT',
  /** 行程未结束，只能存草稿 */
  TRIP_NOT_FINISHED: 'TRIP_NOT_FINISHED',
  /** 仅发起人可以发布 */
  NOT_TRIP_OWNER: 'NOT_TRIP_OWNER',
  /** 段落不属于当前成员，只能改本人创建的段落 */
  NOT_PARAGRAPH_AUTHOR: 'NOT_PARAGRAPH_AUTHOR',
  /** 提交的版本号已过期，整次修改拒绝 */
  DIARY_VERSION_CONFLICT: 'DIARY_VERSION_CONFLICT',
  /** 日记已发布并冻结，不能再修改或重复发布 */
  DIARY_PUBLISHED: 'DIARY_PUBLISHED'
} as const;
