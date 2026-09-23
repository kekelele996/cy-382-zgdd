import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtGuard } from './jwt.guard';

/** 全局认证模块：所有需要鉴权的控制器直接使用 JwtGuard，无需重复注册 JwtModule */
@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev_secret' })],
  providers: [JwtGuard],
  exports: [JwtModule, JwtGuard]
})
export class AuthModule {}
