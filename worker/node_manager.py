"""Pinned package-manager selection shared by workflow and trusted sandbox setup."""
import re
from worker.project import Unsupported


def manager_version(manager, declared=''):
    if manager == 'npm':
        return None
    version = declared.partition('@')[2].split('+')[0] if declared else {'pnpm':'9.15.9','yarn':'1.22.22'}[manager]
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise Unsupported('Package manager needs an exact reproducible version: ' + declared)
    if manager == 'yarn' and not version.startswith('1.'):
        raise Unsupported('Yarn Berry requires repository-specific setup; classic Yarn 1 is supported')
    if manager == 'pnpm' and int(version.split('.')[0]) not in {9,10}:
        raise Unsupported('Supported pnpm major versions are 9 and 10')
    return version
