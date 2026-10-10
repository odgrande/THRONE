import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Where ad images ('uploads') and takeover videos ('renders') live.
//  - local: this machine's disk, served by the API at /uploads and /renders. Dev only:
//    hosts like Render wipe the disk on every deploy, and the video worker runs
//    on a different machine than the API.
//  - supabase: a public Supabase Storage bucket (created by supabase/schema.sql).
export const LOCAL_DIRS = {
  uploads: path.resolve('uploads'),
  renders: path.resolve('renders'),
};

export function createStorage({ supabase, storageBucket, publicUrl }) {
  if (supabase.url) {
    const client = createClient(supabase.url, supabase.serviceRoleKey, { auth: { persistSession: false } });
    const bucket = client.storage.from(storageBucket);
    return {
      kind: 'supabase',
      async put(folder, name, buffer, contentType) {
        const key = `${folder}/${name}`;
        const { error } = await bucket.upload(key, buffer, { contentType, cacheControl: '31536000', upsert: false });
        if (error) throw new Error(`Storage upload failed: ${error.message}`);
        return bucket.getPublicUrl(key).data.publicUrl;
      },
      // Deletes a file by its public URL (…/object/public/<bucket>/<key>).
      async remove(url) {
        const marker = `/object/public/${storageBucket}/`;
        const at = url?.indexOf(marker) ?? -1;
        if (at < 0) return false;
        const { error } = await bucket.remove([decodeURIComponent(url.slice(at + marker.length))]);
        if (error) throw new Error(`Storage delete failed: ${error.message}`);
        return true;
      },
    };
  }

  return {
    kind: 'local',
    async put(folder, name, buffer) {
      const dir = LOCAL_DIRS[folder];
      if (!dir) throw new Error(`Unknown storage folder: ${folder}`);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), buffer);
      return `${publicUrl}/${folder}/${name}`;
    },
    async remove(url) {
      const match = url && /\/(uploads|renders)\/([\w.-]+)$/.exec(url);
      if (!match) return false;
      await rm(path.join(LOCAL_DIRS[match[1]], match[2]), { force: true });
      return true;
    },
  };
}
