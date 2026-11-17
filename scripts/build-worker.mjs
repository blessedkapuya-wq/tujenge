import {build} from 'esbuild';
for(const [entry,file] of [['worker.ts','index.mjs'],['operations.ts','operations.mjs']])await build({entryPoints:['src/server/'+entry],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist-worker/'+file});
