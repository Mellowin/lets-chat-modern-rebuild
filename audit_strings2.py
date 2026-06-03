import re
files = [
    ('apps/web/src/app/workspaces/[workspaceId]/page.tsx', 'workspace'),
    ('apps/web/src/app/workspaces/[workspaceId]/channels/[channelId]/page.tsx', 'channel'),
    ('apps/web/src/app/dashboard/page.tsx', 'dashboard'),
]
for fp, name in files:
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    print('=== ' + name + ' ===')
    for i, line in enumerate(content.split('\n')):
        for match in re.finditer(r'\"([^\"]*[A-Za-z][^\"]*)\"', line):
            s = match.group(1)
            print('  ' + str(i+1) + ': ' + repr(s))
    print()
