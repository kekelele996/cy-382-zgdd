import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** JWT 解析出的当前登录用户 */
export interface AuthUser {
  userId: number;
  nickname: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
