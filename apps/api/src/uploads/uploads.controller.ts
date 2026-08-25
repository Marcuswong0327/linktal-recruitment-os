import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { UploadResultEntity } from './entities/upload-result.entity';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_FILE_BYTES } from './uploads.constants';

const uploadBody = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' } },
    required: ['file'],
  },
};

/**
 * One POST endpoint per owning entity rather than a single
 * `/uploads?entity=...` route — `@RequirePermission` is static route
 * metadata, so it can't branch on a request body/param, and each entity's
 * upload is really gated by that entity's own `update` permission (attaching
 * a file is an edit to the TOB / job order / candidate it's attached to), not
 * a permission of its own.
 *
 * GET /uploads/view is the one exception: it's a single route because the
 * permission it needs (`<resource>:read`) is resolved from the `key` itself
 * at runtime (UploadsService.resourceForKey), which a static decorator can't
 * express — so that check happens by hand in the handler, same pattern as
 * TobsController.purge()'s admin-only check.
 */
@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('tob')
  @RequirePermission('tob', 'update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_FILE_BYTES } }))
  @ApiOperation({ operationId: 'uploadTobFile', summary: "Upload a TOB's source document to R2" })
  @ApiBody(uploadBody)
  @ApiResponse({ status: 201, description: 'Uploaded', type: UploadResultEntity })
  uploadTobFile(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.uploads.upload('tob', this.validate(file));
  }

  @Post('job-order')
  @RequirePermission('job_order', 'update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_FILE_BYTES } }))
  @ApiOperation({ operationId: 'uploadJobOrderFile', summary: "Upload a job order's JD/ad/other document to R2" })
  @ApiBody(uploadBody)
  @ApiResponse({ status: 201, description: 'Uploaded', type: UploadResultEntity })
  uploadJobOrderFile(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.uploads.upload('job-orders', this.validate(file));
  }

  @Post('candidate')
  @RequirePermission('candidate', 'update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_FILE_BYTES } }))
  @ApiOperation({ operationId: 'uploadCandidateFile', summary: "Upload a candidate's resume/document to R2" })
  @ApiBody(uploadBody)
  @ApiResponse({ status: 201, description: 'Uploaded', type: UploadResultEntity })
  uploadCandidateFile(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.uploads.upload('candidates', this.validate(file));
  }

  @Get('view')
  @ApiOperation({
    operationId: 'viewUploadedFile',
    summary: "Stream a previously uploaded file back (permission-gated by its owning entity's read permission)",
  })
  @ApiResponse({ status: 200, description: 'File contents' })
  async view(@Query('key') key: string, @CurrentUser() user: AuthUser) {
    const resource = this.uploads.resourceForKey(key);
    if (!user.permissions.has(`${resource}:read`)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission: ${resource}:read`,
      });
    }
    const { buffer, contentType, fileName } = await this.uploads.get(key);
    return new StreamableFile(buffer, { type: contentType, disposition: `inline; filename="${fileName}"` });
  }

  private validate(file: Express.Multer.File | undefined): Express.Multer.File {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Upload a file as "file".' });
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: `Unsupported file type: ${file.mimetype}`,
      });
    }
    return file;
  }
}
