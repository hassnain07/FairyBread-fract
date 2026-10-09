import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';

export function createSettingsMethods(sb: AppSupabase) {
  return {
    async getSettings(): Promise<Record<string, unknown>> {
      const { data, error } = await sb.from('app_settings').select('key,value');
      if (error) throw toAppError(error);
      return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
    },

    async updateSetting(key: string, value: unknown): Promise<void> {
      const { error } = await sb
        .from('app_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key);
      if (error) throw toAppError(error);
    },

    async getDocuments(): Promise<Record<string, string>> {
      const { data, error } = await sb.from('documents').select('key,storage_path,version');
      if (error) throw toAppError(error);
      const result: Record<string, string> = {};
      for (const r of data ?? []) {
        const { data: urlData } = sb.storage.from('documents').getPublicUrl(r.storage_path);
        result[r.key] = `${urlData.publicUrl}?v=${r.version}`;
      }
      return result;
    },

    async uploadDocument(key: string, file: File): Promise<string> {
      const { data: existing } = await sb.from('documents').select('version').eq('key', key).maybeSingle();
      const version = (existing?.version ?? 0) + 1;
      const path = `${key}/v${version}.pdf`;
      const { error: upErr } = await sb.storage.from('documents').upload(path, file, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw toAppError(upErr);
      const { error: dbErr } = await sb.from('documents').upsert({ key, storage_path: path, version, original_filename: file.name }, { onConflict: 'key' });
      if (dbErr) throw toAppError(dbErr);
      const { data: urlData } = sb.storage.from('documents').getPublicUrl(path);
      return `${urlData.publicUrl}?v=${version}`;
    },
  };
}
