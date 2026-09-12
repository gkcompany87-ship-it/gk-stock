import { Global, Module } from "@nestjs/common";
import { FileStorageService } from "./file-storage.service.js";
import { FilesController } from "./files.controller.js";
@Global() @Module({ providers: [FileStorageService], controllers: [FilesController], exports: [FileStorageService] })
export class StorageModule {}
