import type {UserConfig} from 'vite';
import { svelte } from "@sveltejs/vite-plugin-svelte";

import * as path from "path";

const config: UserConfig = {
    publicDir: "public",
    base: "/modules/fabricate/",
    root: "src/",
    server: {
        port: 30001,
        open: "http://127.0.0.1:30001/game",
        proxy: {
            "^(?!/modules/fabricate)": "http://localhost:30000/",
            "/socket.io": {
                target: "ws://localhost:30000",
                ws: true,
            }
        }
    },
    build: {
        outDir: path.resolve(__dirname, "dist"),
        emptyOutDir: true,
        sourcemap: true,
        lib: {
            name: "fabricate",
            entry: path.resolve(__dirname, "src/fabricate.ts"),
            formats: ["es"],
            fileName: "fabricate"
        }
    },
    plugins: [
        svelte({
            onwarn: (warning, defaultHandler) => {
                /*
                    Ignore Svelte accessibility warnings. Resolution path is to convert all non-button interactive
                    element containers with a "<button>", which I'm just not doing.
                */
                if (warning.code.startsWith("a11y")) {
                    return;
                }
                defaultHandler(warning);
            },
            configFile: path.resolve(__dirname, "svelte.config.js")
        })
    ]
}

export default config;