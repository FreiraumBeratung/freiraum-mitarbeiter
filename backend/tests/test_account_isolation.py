from pathlib import Path

from app.services.account_paths import account_dir, account_id_from_email
from app.services.account_registry import AccountRegistry
from app.services.account_session import (
    consume_claim_token,
    create_claim_token,
    get_current_account_id,
    set_current_account_id,
    sign_account_session,
    verify_account_session,
)
from app.services.contact_store import get_contact_store


def test_same_email_same_id():
    first = account_id_from_email("Thomas@Allianz.de")
    second = account_id_from_email("thomas@allianz.de")
    assert first == second
    assert len(first) == 16


def test_different_emails_different_ids():
    denis = account_id_from_email("denis@web.de")
    brother = account_id_from_email("bruder@allianz.de")
    assert denis != brother


def test_session_roundtrip():
    account_id = account_id_from_email("pilot@example.com")
    token = sign_account_session(account_id)
    assert verify_account_session(token) == account_id
    assert verify_account_session("nope") is None
    assert verify_account_session(f"{account_id}.deadbeef") is None


def test_claim_is_single_use():
    account_id = account_id_from_email("pilot@example.com")
    claim = create_claim_token(account_id)
    assert consume_claim_token(claim) == account_id
    assert consume_claim_token(claim) is None


def test_registry_has_no_tokens(tmp_path: Path):
    registry = AccountRegistry(db_path=tmp_path / "accounts.sqlite3")
    account = registry.upsert_from_mailbox(email="pilot@example.com", display_name="Pilot")
    listed = registry.list_public()
    assert listed[0]["email"] == "pilot@example.com"
    assert listed[0]["id"] == account["id"]
    assert listed[0]["provider"] == "imap_smtp"
    public_keys = set(listed[0].keys())
    assert "access_token" not in public_keys
    assert "refresh_token" not in public_keys
    blob = (tmp_path / "accounts.sqlite3").read_bytes()
    assert b"access_token" not in blob
    assert b"refresh_token" not in blob


def test_account_dirs_are_isolated(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("FREIRAUM_DATA_DIR", str(tmp_path))
    first = account_dir(account_id_from_email("a@example.com"))
    second = account_dir(account_id_from_email("b@example.com"))
    assert first != second
    (first / "marker.txt").write_text("a", encoding="utf-8")
    assert not (second / "marker.txt").exists()


def test_contact_stores_do_not_share_files(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("FREIRAUM_DATA_DIR", str(tmp_path))
    from app.services import contact_store as contact_store_mod
    from app.services.account_session import reset_current_account_id

    contact_store_mod._stores.clear()
    first_id = account_id_from_email("a@example.com")
    second_id = account_id_from_email("b@example.com")
    token = set_current_account_id(first_id)
    try:
        first_store = get_contact_store()
        first_store.remember_resolution(query_norm="thomas", email="thomas@example.com", display_name="Thomas")
    finally:
        reset_current_account_id(token)

    token = set_current_account_id(second_id)
    try:
        second_store = get_contact_store()
        assert first_store.db_path != second_store.db_path
        assert second_store.get_remembered_resolution("thomas") is None
    finally:
        reset_current_account_id(token)


def test_missing_session_has_no_account():
    from app.services.account_session import reset_current_account_id

    token = set_current_account_id(None)
    try:
        assert get_current_account_id() is None
    finally:
        reset_current_account_id(token)


def test_admin_accounts_requires_key(monkeypatch):
    from fastapi import HTTPException

    from app.routers.admin_accounts import _require_admin

    monkeypatch.delenv("FREIRAUM_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("FM_ADMIN_KEY", raising=False)
    try:
        _require_admin(None, "secret")
        raise AssertionError("expected 503")
    except HTTPException as exc:
        assert exc.status_code == 503

    monkeypatch.setenv("FM_ADMIN_KEY", "test-admin-key")
    try:
        _require_admin(None, "wrong")
        raise AssertionError("expected 401")
    except HTTPException as exc:
        assert exc.status_code == 401
    _require_admin(None, "test-admin-key")


def test_same_email_same_id():
    first = account_id_from_email("Thomas@Allianz.de")
    second = account_id_from_email("thomas@allianz.de")
    assert first == second
    assert len(first) == 16


def test_different_emails_different_ids():
    denis = account_id_from_email("denis@web.de")
    brother = account_id_from_email("bruder@allianz.de")
    assert denis != brother


def test_session_roundtrip():
    account_id = account_id_from_email("pilot@example.com")
    token = sign_account_session(account_id)
    assert verify_account_session(token) == account_id
    assert verify_account_session("nope") is None
    assert verify_account_session(f"{account_id}.deadbeef") is None


def test_claim_is_single_use():
    account_id = account_id_from_email("pilot@example.com")
    claim = create_claim_token(account_id)
    assert consume_claim_token(claim) == account_id
    assert consume_claim_token(claim) is None


def test_registry_has_no_tokens(tmp_path: Path):
    registry = AccountRegistry(db_path=tmp_path / "accounts.sqlite3")
    account = registry.upsert_from_mailbox(email="pilot@example.com", display_name="Pilot")
    listed = registry.list_public()
    assert listed[0]["email"] == "pilot@example.com"
    assert listed[0]["id"] == account["id"]
    blob = (tmp_path / "accounts.sqlite3").read_bytes()
    assert b"access_token" not in blob
    assert b"refresh_token" not in blob


def test_account_dirs_are_isolated(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("FREIRAUM_DATA_DIR", str(tmp_path))
    first = account_dir(account_id_from_email("a@example.com"))
    second = account_dir(account_id_from_email("b@example.com"))
    assert first != second
    (first / "marker.txt").write_text("a", encoding="utf-8")
    assert not (second / "marker.txt").exists()
