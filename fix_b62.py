path = r'apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_start = '      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">\n        <h2 className="text-sm font-semibold">{t("channel.messages")}</h2>\n\n        {/* Typing indicator */}'
old_end = '      </div>\n\n      {/* Members */}'

start_idx = content.find(old_start)
end_idx = content.find(old_end)

if start_idx == -1:
    print('start not found')
    exit(1)
if end_idx == -1:
    print('end not found')
    exit(1)

middle = content[start_idx + len(old_start):end_idx]

composer_marker = '\n        {/* Composer */}\n        {channel.kind === "success" && ('
composer_start = middle.find(composer_marker)
if composer_start == -1:
    print('composer marker not found')
    exit(1)

composer_end = middle.find('\n          </form>\n        )}\n\n        {messages.kind === "loading"', composer_start)
if composer_end == -1:
    print('composer end not found')
    exit(1)

composer_block = middle[composer_start:composer_end + len('\n          </form>\n        )}')]
composer_block_clean = composer_block.replace('\n        {/* Composer */}', '').lstrip('\n')
composer_block_clean = composer_block_clean.replace(
    'className="mt-4 flex flex-col gap-2"',
    'className="mt-4 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4"'
)

before_composer = middle[:composer_start].rstrip('\n')
after_composer = middle[composer_end + len('\n          </form>\n        )}'):].lstrip('\n')

new_middle = before_composer + '\n\n        <div className="mt-4 flex min-h-[420px] flex-col">\n          <div className="min-h-0 flex-1 overflow-y-auto pr-1">\n' + after_composer + '\n          </div>\n\n        ' + composer_block_clean + '\n        </div>'

new_block = old_start + new_middle + '\n' + old_end
new_content = content[:start_idx] + new_block + content[end_idx + len(old_end):]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done')
