"""Trusted local provisioning. Passwords are read privately, never printed."""
import argparse
import getpass
import sys
from pathlib import Path
from backend.app import app
from backend.auth.service import auth_connection, create_user, _password_error, audit
from backend.core.database import MUNICIPALITY_ID, data_path
from flask import g
from backend.core.schema import initialize_database
from werkzeug.security import generate_password_hash

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    tenant=sub.add_parser('municipality');tenant.add_argument('id');tenant.add_argument('--name',required=True)
    create=sub.add_parser('create');create.add_argument('--email',required=True);create.add_argument('--name',required=True);create.add_argument('--role',choices=['admin','maintenance','worker'],default='admin');create.add_argument('--team');create.add_argument('--municipality',default='default');create.add_argument('--password-stdin',action='store_true')
    reset_mfa=sub.add_parser('reset-mfa');reset_mfa.add_argument('--email',required=True)
    reset=sub.add_parser('reset');reset.add_argument('--email',required=True);reset.add_argument('--password-stdin',action='store_true')
    args=parser.parse_args()
    with app.app_context():
        if args.command=='municipality':
            if not MUNICIPALITY_ID.fullmatch(args.id) or not 1<=len(args.name.strip())<=80:parser.error('Invalid municipality ID or name.')
            g.municipality_id=args.id;initialize_database(data_path())
            with auth_connection() as conn:conn.execute('INSERT INTO municipalities (id,name) VALUES (?,?)',(args.id,args.name.strip()))
            print('Municipality provisioned.');return
        if args.command=='reset-mfa':
            with auth_connection() as conn:
                conn.execute('BEGIN IMMEDIATE')
                user=conn.execute('SELECT id,municipality_id FROM auth_users WHERE email=?',(args.email.strip().casefold(),)).fetchone()
                if not user:parser.error('Account not found.')
                conn.execute('UPDATE auth_users SET mfa_enabled=0,mfa_nonce=NULL,mfa_last_counter=-1 WHERE id=?',(user['id'],))
                conn.execute('DELETE FROM auth_recovery_codes WHERE user_id=?',(user['id'],));conn.execute('DELETE FROM auth_sessions WHERE user_id=?',(user['id'],))
                audit(conn,'cli_mfa_reset',target=user['id'],municipality=user['municipality_id'])
            print('Authenticator reset and sessions revoked. Verify the account owner before issuing access.');return
        password=sys.stdin.readline().rstrip('\r\n') if args.password_stdin else getpass.getpass('Temporary passphrase (15–128 characters): ')
        if not args.password_stdin and password!=getpass.getpass('Confirm passphrase: '):parser.error('Passphrases do not match.')
        if _password_error(password):parser.error(_password_error(password))
        if args.command=='create':
            g.municipality_id=args.municipality;initialize_database(data_path());create_user(args.email,args.name,password,args.role,args.municipality,args.team)
            print('Account created. Password change required at first sign-in.')
        else:
            with auth_connection() as conn:
                user=conn.execute('SELECT id,municipality_id FROM auth_users WHERE email=?',(args.email.strip().casefold(),)).fetchone()
                if not user:parser.error('Account not found.')
                conn.execute('UPDATE auth_users SET password_hash=?,must_change_password=1 WHERE id=?',(generate_password_hash(password,method='scrypt'),user['id']))
                conn.execute('DELETE FROM auth_sessions WHERE user_id=?',(user['id'],));audit(conn,'cli_password_reset',target=user['id'],municipality=user['municipality_id'])
            print('Password reset. Existing sessions revoked.')
if __name__=='__main__':main()
