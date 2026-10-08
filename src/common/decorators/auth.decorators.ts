import { SetMetadata, createParamDecorator, ExecutionContext, applyDecorators, Controller } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

export const Public = () => SetMetadata('public', true);
export const Roles = (...r: string[]) => SetMetadata('roles', r);
export const Feat = (f: string) => SetMetadata('feature', f);
export const Me = createParamDecorator((_: any, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user);
export const Ctl = (p: string) => applyDecorators(Controller(p), ApiTags(p), ApiBearerAuth());
