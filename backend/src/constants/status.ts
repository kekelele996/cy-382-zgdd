export enum TripStatus { Open = 'OPEN', Matched = 'MATCHED', Finished = 'FINISHED' }
export enum TransportType { SelfDrive = '自驾', Public = '公共交通', Hiking = '徒步' }

/** 行程成员状态 */
export enum MemberStatus { Active = 'ACTIVE', Left = 'LEFT' }

/** 日记发布状态：行程结束前只能存草稿，发起人发布后冻结 */
export enum DiaryStatus { Draft = 'DRAFT', Published = 'PUBLISHED' }
