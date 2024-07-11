"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const platform_1 = __importDefault(require("./platform")); // Utilisez l'exportation par défaut
const settings_1 = require("./settings");
exports.default = (api) => {
    api.registerPlatform(settings_1.PLATFORM_NAME, platform_1.default);
};
