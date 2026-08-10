import argparse
import getpass
import os
import re
import secrets
import stat
import subprocess
from pathlib import Path


DESKTOP_CERTIFICATE_NAME = 'wardriver-mtls-desktop-dev-2026-public.pem'
DESKTOP_P12_NAME = 'wardriver-mtls-desktop-dev-2026.pfx'
LOCAL_CA_NAME = 'ca.pem'
LOCAL_PROOF_DIRECTORY_NAME = 'local-mtls-lab'
LOCAL_PROOF_ENVIRONMENT_FILE_NAME = 'local-proof.env'
MAX_DESKTOP_P12_BYTES = 256 * 1024
MAX_PUBLIC_CERTIFICATE_BYTES = 64 * 1024
MAX_LOCAL_CA_CERTIFICATE_BYTES = 64 * 1024
MAX_LOCAL_PROOF_ENVIRONMENT_BYTES = 16 * 1024
TRUSTED_AUTHORITY_BOUNDARY = (
    'This bootstrap grants direct ACL access only to the operator\'s current Windows account. '
    'A Windows administrator or SYSTEM may take ownership outside this boundary; it fails closed on detected reparse points '
    'and is not a sandbox against hostile same-user or host-administrator code.'
)


parser = argparse.ArgumentParser(description='Create the protected local-proof Docker Compose environment.')
parser.add_argument(
    '--out',
    required=True,
    type=Path,
    help='New local-proof.env directly under %LOCALAPPDATA%\\BlueSwallow\\credentials\\local-mtls-lab.',
)
args = parser.parse_args()


def protected_credential_root() -> Path:
    local_app_data = os.environ.get('LOCALAPPDATA')
    if not local_app_data:
        raise SystemExit('LOCALAPPDATA is required on this Windows development host')
    return Path(local_app_data) / 'BlueSwallow' / 'credentials'


def absolute_unresolved(path: Path) -> Path:
    expanded = path.expanduser()
    return expanded if expanded.is_absolute() else Path.cwd() / expanded


def is_windows_reparse_point(path: Path) -> bool:
    try:
        attributes = path.lstat().st_file_attributes
    except FileNotFoundError:
        return False
    return bool(attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)


def assert_no_reparse_components(path: Path, label: str) -> Path:
    candidate = absolute_unresolved(path)
    current = Path(candidate.anchor)
    for component in candidate.parts[1:]:
        current /= component
        if current.is_symlink() or is_windows_reparse_point(current):
            raise SystemExit(f'{label} must not traverse a reparse point: {current}')
    return candidate


def assert_resolved_within_root(resolved: Path, credential_root: Path, label: str) -> None:
    try:
        resolved.relative_to(credential_root)
    except ValueError as error:
        raise SystemExit(f'{label} resolves outside the protected credential root') from error


def secure_regular_file(path: Path, label: str, max_bytes: int, credential_root: Path) -> Path:
    raw = assert_no_reparse_components(path, label)
    try:
        resolved = raw.resolve(strict=True)
    except FileNotFoundError as error:
        raise SystemExit(f'{label} does not exist: {raw}') from error
    assert_resolved_within_root(resolved, credential_root, label)
    if not resolved.is_file():
        raise SystemExit(f'{label} must be a regular file: {resolved}')
    if resolved.stat().st_size <= 0 or resolved.stat().st_size > max_bytes:
        raise SystemExit(f'{label} must be non-empty and no larger than {max_bytes} bytes')
    if '\r' in str(resolved) or '\n' in str(resolved):
        raise SystemExit(f'{label} path must not contain a line break')
    return resolved


def secure_directory(path: Path, label: str, credential_root: Path) -> Path:
    raw = assert_no_reparse_components(path, label)
    try:
        resolved = raw.resolve(strict=True)
    except FileNotFoundError as error:
        raise SystemExit(f'{label} does not exist: {raw}') from error
    assert_resolved_within_root(resolved, credential_root, label)
    if not resolved.is_dir():
        raise SystemExit(f'{label} must be a directory: {resolved}')
    return resolved


def expected_acl_principal(principal: str) -> str:
    return principal.casefold()


def is_owner_principal(principal: str) -> bool:
    owner = getpass.getuser().casefold()
    normalized = expected_acl_principal(principal)
    return normalized == owner or normalized.endswith(f'\\{owner}')


def parse_icacls(path: Path) -> list[tuple[str, str]]:
    result = subprocess.run(
        ['icacls', str(path)],
        check=True,
        capture_output=True,
        text=True,
        encoding='utf-8',
    )
    entries: list[tuple[str, str]] = []
    first = True
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if not line or line.startswith('Successfully processed'):
            continue
        if first:
            expected_prefix = str(path)
            if not line.startswith(expected_prefix):
                raise SystemExit(f'icacls did not report the expected path: {path}')
            line = line[len(expected_prefix):].strip()
            first = False
        match = re.fullmatch(r'(?P<principal>.+?):(?P<rights>(?:\(I\))?(?:\(OI\))?(?:\(CI\))?\(F\))', line)
        if not match:
            raise SystemExit(f'Could not parse a restrictive ACL entry for {path}')
        entries.append((match.group('principal'), match.group('rights')))
    if first or not entries:
        raise SystemExit(f'icacls returned no ACL entries for {path}')
    return entries


def assert_restricted_windows_acl(path: Path, directory: bool) -> None:
    expected_rights = '(OI)(CI)(F)' if directory else '(F)'
    found_owner = False
    for principal, rights in parse_icacls(path):
        if rights != expected_rights:
            raise SystemExit(f'{path} ACL contains inherited or non-full-control access: {principal}:{rights}')
        if is_owner_principal(principal):
            found_owner = True
        else:
            raise SystemExit(f'{path} ACL grants an unapproved principal: {principal}')
    if not found_owner:
        raise SystemExit(f'{path} ACL is missing current-user full control')


def harden_windows_acl(path: Path, directory: bool) -> None:
    rights = '(OI)(CI)F' if directory else 'F'
    for principal in ('NT AUTHORITY\\SYSTEM', 'BUILTIN\\Administrators'):
        subprocess.run(
            ['icacls', str(path), '/remove:g', principal],
            check=False,
            capture_output=True,
            text=True,
            encoding='utf-8',
        )
    subprocess.run(
        ['icacls', str(path), '/inheritance:r', '/grant:r', f'{getpass.getuser()}:{rights}'],
        check=True,
        capture_output=True,
        text=True,
        encoding='utf-8',
    )
    assert_restricted_windows_acl(path, directory)


credential_root = assert_no_reparse_components(protected_credential_root(), 'Protected credential root')
credential_root.mkdir(parents=True, exist_ok=True)
credential_root = secure_directory(credential_root, 'Protected credential root', credential_root)
protected_env_root = credential_root / LOCAL_PROOF_DIRECTORY_NAME
protected_env_root.mkdir(parents=True, exist_ok=True)
protected_env_root = secure_directory(protected_env_root, 'Protected local-proof directory', credential_root)
harden_windows_acl(protected_env_root, directory=True)

lab_dir = protected_env_root
desktop_cert = secure_regular_file(
    credential_root / DESKTOP_CERTIFICATE_NAME, 'Desktop public certificate', MAX_PUBLIC_CERTIFICATE_BYTES, credential_root
)
desktop_p12 = secure_regular_file(
    credential_root / DESKTOP_P12_NAME, 'Desktop PKCS#12', MAX_DESKTOP_P12_BYTES, credential_root
)
local_ca = secure_regular_file(
    lab_dir / LOCAL_CA_NAME, 'Local CA certificate', MAX_LOCAL_CA_CERTIFICATE_BYTES, credential_root
)
harden_windows_acl(desktop_cert, directory=False)
harden_windows_acl(desktop_p12, directory=False)
harden_windows_acl(local_ca, directory=False)

requested_out = assert_no_reparse_components(args.out, 'Protected environment output')
expected_out = protected_env_root / LOCAL_PROOF_ENVIRONMENT_FILE_NAME
if os.path.normcase(os.path.normpath(str(requested_out))) != os.path.normcase(os.path.normpath(str(expected_out))):
    raise SystemExit(f'Protected environment output must be exactly {expected_out}')
out = expected_out
assert_no_reparse_components(out, 'Protected environment output')
if out.exists():
    raise SystemExit(f'Refusing to overwrite existing protected environment file: {out}')

def certificate_fingerprint_from_file(certificate: Path) -> str:
    try:
        pem = certificate.read_text(encoding='utf-8')
    except OSError as error:
        raise SystemExit('Desktop public certificate could not be read') from error
    return certificate_fingerprint_from_pem(
        exactly_one_pem_certificate(pem, 'Desktop public certificate')
    )


def certificate_fingerprint_from_pem(pem: str) -> str:
    output = subprocess.run(
        ['openssl', 'x509', '-noout', '-fingerprint', '-sha256'],
        check=True,
        input=pem,
        capture_output=True,
        text=True,
        encoding='utf-8',
    ).stdout.strip()
    if '=' not in output:
        raise SystemExit('OpenSSL did not return a SHA-256 PKCS#12 leaf fingerprint')
    return output.split('=', 1)[1].replace(':', '').lower()


def exactly_one_pem_certificate(pem: str, label: str) -> str:
    begin = '-----BEGIN CERTIFICATE-----'
    end = '-----END CERTIFICATE-----'
    if pem.count(begin) != 1 or pem.count(end) != 1:
        raise SystemExit(f'{label} must contain exactly one client certificate')
    start = pem.find(begin)
    finish = pem.find(end, start)
    if start < 0 or finish < start:
        raise SystemExit(f'{label} must contain exactly one client certificate')
    return pem[start:finish + len(end)]


def assert_exactly_one_private_key(pem: str) -> None:
    private_key_begins = re.findall(r'-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----', pem)
    private_key_ends = re.findall(r'-----END(?: [A-Z0-9]+)* PRIVATE KEY-----', pem)
    if len(private_key_begins) != 1 or len(private_key_ends) != 1:
        raise SystemExit('Desktop PKCS#12 must contain exactly one private key')


def assert_passwordless_p12_matches_desktop_certificate(desktop_p12: Path, desktop_cert: Path) -> str:
    try:
        p12_public_leaf = subprocess.run(
            ['openssl', 'pkcs12', '-in', str(desktop_p12), '-passin', 'pass:', '-clcerts', '-nokeys'],
            check=True,
            capture_output=True,
            text=True,
            encoding='utf-8',
        ).stdout
        p12_private_key = subprocess.run(
            ['openssl', 'pkcs12', '-in', str(desktop_p12), '-passin', 'pass:', '-nocerts', '-nodes'],
            check=True,
            capture_output=True,
            text=True,
            encoding='utf-8',
        ).stdout
    except subprocess.CalledProcessError as error:
        raise SystemExit('Desktop PKCS#12 must be passwordless and contain exactly one readable client certificate and exactly one private key') from error
    p12_fingerprint = certificate_fingerprint_from_pem(
        exactly_one_pem_certificate(p12_public_leaf, 'Desktop PKCS#12')
    )
    assert_exactly_one_private_key(p12_private_key)
    certificate_fingerprint = certificate_fingerprint_from_file(desktop_cert)
    if p12_fingerprint != certificate_fingerprint:
        raise SystemExit('Desktop PKCS#12 public leaf does not match the approved desktop public certificate')
    return certificate_fingerprint


fingerprint = assert_passwordless_p12_matches_desktop_certificate(desktop_p12, desktop_cert)

compose_environment = '\n'.join([
    f'POSTGRES_USER=wardriver',
    f'POSTGRES_PASSWORD={secrets.token_hex(24)}',
    f'POSTGRES_DB=cybermap',
    f'BSS_MTLS_PROXY_SECRET={secrets.token_hex(32)}',
    f'BSS_DESKTOP_CLIENT_CERT_PEM={desktop_cert}',
    f'BSS_LOCAL_CLIENT_P12={desktop_p12}',
    f'BSS_LOCAL_CA_CERT={local_ca}',
    f'LOCAL_MTLS_CERT_FINGERPRINT={fingerprint}',
    f'BSS_LOCAL_DEVICE_ID=wardriver-desktop-dev-2026',
    f'BSS_LOCAL_MTLS_LAB_DIR={lab_dir}',
    '',
])

try:
    with out.open('x', encoding='utf-8', newline='\n') as output:
        output.write(compose_environment)
except FileExistsError as error:
    raise SystemExit(f'Refusing to overwrite existing protected environment file: {out}') from error

out = secure_regular_file(
    out, 'Protected environment output', MAX_LOCAL_PROOF_ENVIRONMENT_BYTES, credential_root
)
harden_windows_acl(out, directory=False)
print('LOCAL_PROOF_ENVIRONMENT=created')
