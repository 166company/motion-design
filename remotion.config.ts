import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
// Instagram Reels üçün yüksək keyfiyyət, amma 100 MB-dan kiçik
Config.setCrf(21);
Config.setChromiumOpenGlRenderer("angle");
