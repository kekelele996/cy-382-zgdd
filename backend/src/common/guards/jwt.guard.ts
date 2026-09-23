import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ERROR_CODES } from '../../constants/errors';
import { AppException } from '../errors/app.exception';

export interface AuthUser {
  userId: number;
  nickname: string;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppException(ERROR_CODES.AUTH_REQUIRED, '请先登录', 401);
    try {
      req.user = this.jwt.verify(token) as AuthUser;
    } catch {
      throw new AppException(ERROR_CODES.AUTH_REQUIRED, '登录已失效，请重新登录', 401);
    }
    return true;
  }
}
