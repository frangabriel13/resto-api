import { Module } from '@nestjs/common';
import { imageStorageProvider } from './image-storage.provider.js';
import { ImagesService } from './images.service.js';

@Module({
  providers: [imageStorageProvider, ImagesService],
  exports: [ImagesService],
})
export class ImagesModule {}
