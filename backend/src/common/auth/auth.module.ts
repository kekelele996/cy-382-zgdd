import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtGuard } from '../guards/jwt.guard';

export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev_secret';

@Global()
@Module({
  imports: [JwtModule.register({ secret: JWT_SECRET })],
  providers: [JwtGuard],
  exports: [JwtModule, JwtGuard]
})
export class AuthModule {}
