#!/usr/bin/env python3
"""Install vetted NVIDIA values into the protected server environment without logging them."""
import os
import re
import stat
from pathlib import Path

if os.geteuid() != 0:
    raise SystemExit('Run inference configuration installation as root')
source = Path('/home/linuxuser/.config/breachbay/nvidia.pending.env')
target = Path('/etc/breachbay/application.env')
for path in (source, target):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
        raise SystemExit('Protected regular configuration required')
if target.lstat().st_uid != 0:
    raise SystemExit('Root-owned application configuration required')
values = {}
for line in source.read_text().splitlines():
    name, separator, value = line.partition('=')
    if not separator or name in values:
        raise SystemExit('Exact inference configuration required')
    values[name] = value
if set(values) != {'NEMOTRON_API_KEY', 'NEMOTRON_BASE_URL', 'NEMOTRON_MODEL'}:
    raise SystemExit('Exact inference keys required')
if not re.fullmatch(r'nvapi-[A-Za-z0-9_-]{20,300}', values['NEMOTRON_API_KEY']):
    raise SystemExit('Hosted inference key format required')
if values['NEMOTRON_BASE_URL'] != 'https://integrate.api.nvidia.com/v1':
    raise SystemExit('Trusted NVIDIA hosted endpoint required')
if not re.fullmatch(r'nvidia/[A-Za-z0-9_.-]*nemotron[A-Za-z0-9_.-]*', values['NEMOTRON_MODEL']):
    raise SystemExit('Vetted NVIDIA Nemotron identifier required')
original = target.read_text().splitlines()
lines = [line for line in original if line.partition('=')[0] not in values]
lines.extend(name + '=' + values[name] for name in ('NEMOTRON_API_KEY', 'NEMOTRON_BASE_URL', 'NEMOTRON_MODEL'))
temporary = target.with_name(target.name + '.next-' + str(os.getpid()))
descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, 'w') as stream:
    stream.write('\n'.join(lines) + '\n')
    stream.flush()
    os.fsync(stream.fileno())
os.replace(temporary, target)
print('PASS: vetted hosted inference configuration installed privately; restart/release and live tool verification still required')
