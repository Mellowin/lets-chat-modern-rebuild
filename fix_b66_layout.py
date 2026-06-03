path = r'apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_start = '      <div className="mt-8 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-5">\n        <h2 className="text-sm font-semibold">{t("channel.messages")}</h2>'
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

# Extract typing indicator block
typing_marker = '\n\n        {/* Typing indicator */}\n        {Object.keys(typingUsers).length > 0 && ('
typing_start = middle.find(typing_marker)
if typing_start == -1:
    print('typing marker not found')
    exit(1)

typing_end = middle.find('\n          </div>\n        )}', typing_start)
if typing_end == -1:
    print('typing end not found')
    exit(1)

typing_block = middle[typing_start:typing_end + len('\n          </div>\n        )}')]

# Extract flex-col content (from <div className="mt-4 flex min-h-[420px] flex-col">)
flex_marker = '\n\n        <div className="mt-4 flex min-h-[420px] flex-col">\n          <div className="min-h-0 flex-1 overflow-y-auto pr-1">'
flex_start = middle.find(flex_marker)
if flex_start == -1:
    print('flex marker not found')
    exit(1)

# The flex container ends with: \n        )}\n        </div>\n
flex_end = middle.find('\n        )}\n        </div>\n', flex_start)
if flex_end == -1:
    print('flex end not found')
    exit(1)

flex_block = middle[flex_start:flex_end + len('\n        )}\n        </div>\n')]

# Extract messages content from inside flex-1 div
inner_start_marker = '<div className="min-h-0 flex-1 overflow-y-auto pr-1">\n'
inner_start = flex_block.find(inner_start_marker)
if inner_start == -1:
    print('inner start not found')
    exit(1)

inner_end_marker = '\n          </div>\n\n                {channel.kind === "success" && ('
inner_end = flex_block.find(inner_end_marker)
if inner_end == -1:
    print('inner end not found')
    exit(1)

messages_content = flex_block[inner_start + len(inner_start_marker):inner_end]

# Extract composer block
composer_marker = '\n                {channel.kind === "success" && ('
composer_start = flex_block.find(composer_marker)
if composer_start == -1:
    print('composer start not found')
    exit(1)

composer_end = flex_block.find('\n          </form>\n        )}', composer_start)
if composer_end == -1:
    print('composer end not found')
    exit(1)

composer_block = flex_block[composer_start:composer_end + len('\n          </form>\n        )}')]
composer_block_clean = composer_block.replace(
    'className="mt-4 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4"',
    'className="shrink-0 flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-800 p-4"'
)

# Build new messages card
new_card = (
    '      <div className="mt-6 flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 overflow-hidden">\n'
    '        <div className="shrink-0 px-4 pt-4 pb-2">\n'
    '          <h2 className="text-sm font-semibold">{t("channel.messages")}</h2>'
    + typing_block.replace('\n        {/* Typing indicator */}', '\n          {/* Typing indicator */}').replace('\n        {Object.keys', '\n          {Object.keys').replace('\n            {Object.values', '\n              {Object.values').replace('\n            {Object.keys', '\n              {Object.keys').replace('\n          </div>\n        )}', '\n          </div>\n          )}') +
    '\n        </div>\n\n'
    '        <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2">\n'
    + messages_content +
    '\n          <div ref={messagesEndRef} className="h-1" />\n'
    '        </div>\n\n'
    '        ' + composer_block_clean +
    '\n      </div>'
)

new_content = content[:start_idx] + new_card + content[end_idx + len(old_end):]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done')
