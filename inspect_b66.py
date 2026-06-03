path = r'apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_start = '      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">\n        <h2 className="text-sm font-semibold">{t("channel.messages")}</h2>'
old_end = '      </div>\n\n      {/* Members */}'

start_idx = content.find(old_start)
end_idx = content.find(old_end)
middle = content[start_idx + len(old_start):end_idx]

# Find flex block and show end
flex_marker = '\n\n        <div className="mt-4 flex min-h-[420px] flex-col">\n          <div className="min-h-0 flex-1 overflow-y-auto pr-1">'
flex_start = middle.find(flex_marker)

# Show last 300 chars of middle
print('MIDDLE END:')
print(repr(middle[-400:]))
