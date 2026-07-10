import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ operationId: 'getHealth', summary: 'Health check' })
  check() {
    return { status: 'ok', service: 'linktal-api' };
  }
}
