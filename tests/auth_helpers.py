import tempfile
from pathlib import Path
from auth_service import create_user
from schema import initialize_database
PASSWORD='Synthetic test passphrase 42!'
def authenticate(case):
    import app as m
    previous=m.app.config.copy()
    temp=tempfile.TemporaryDirectory();case.addCleanup(temp.cleanup)
    case.addCleanup(lambda:(m.app.config.clear(),m.app.config.update(previous)))
    db=getattr(getattr(case,'temp_db',None),'name',str(Path(temp.name)/'data.db'))
    initialize_database(db)
    m.app.config.update(TESTING=True,AUTH_DB_PATH=str(Path(temp.name)/'auth.db'),DATA_DB_PATH=db,AUTH_COOKIE_SECURE=False,TENANT_DATA_DIR=str(Path(temp.name)/'tenants'))
    with m.app.app_context():create_user('test@example.test','Test administrator',PASSWORD,'admin',must_change_password=False)
    c=case.client
    token=c.get('/api/auth/session').json['csrf_token']
    r=c.post('/api/auth/login',json={'email':'test@example.test','password':PASSWORD},headers={'X-CSRF-Token':token})
    assert r.status_code==200,r.json
    c.environ_base['HTTP_X_CSRF_TOKEN']=r.json['csrf_token']
