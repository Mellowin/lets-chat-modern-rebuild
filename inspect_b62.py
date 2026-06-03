with open(r'apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_start = '      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">\n        <h2 className="text-sm font-semibold">{t("channel.messages")}</h2>\n\n        {/* Typing indicator */}'
old_end = '      </div>\n\n      {/* Members */}'

start_idx = content.find(old_start)
end_idx = content.find(old_end)
print('start', start_idx)
print('end', end_idx)
if start_idx != -1 and end_idx != -1:
    middle = content[start_idx + len(old_start):end_idx]
    print('MIDDLE END:')
    print(repr(middle[-400:]))
