import re
files = [
    ('apps/web/src/app/login/page.tsx', 'login'),
    ('apps/web/src/app/register/page.tsx', 'register'),
    ('apps/web/src/app/profile/page.tsx', 'profile'),
    ('apps/web/src/app/page.tsx', 'home'),
    ('apps/web/src/components/MessageAuthor.tsx', 'MessageAuthor'),
    ('apps/web/src/app/layout.tsx', 'layout'),
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
