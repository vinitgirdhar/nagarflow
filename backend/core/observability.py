"""Request correlation and metadata-only application logging."""
import json
import logging
import time
import uuid
from flask import g, request

def install_observability(app):
    app.logger.setLevel(logging.INFO)
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    @app.before_request
    def correlate_request():
        g.request_id=uuid.uuid4().hex;g.request_started=time.monotonic()
    @app.after_request
    def log_request(response):
        identifier=getattr(g,'request_id',uuid.uuid4().hex)
        response.headers['X-Request-ID']=identifier
        if response.status_code>=400 and response.is_json:
            data=response.get_json(silent=True)
            if isinstance(data,dict):data['request_id']=identifier;response.set_data(app.json.dumps(data))
        # Route templates, never URLs, payloads, credentials or citizen text.
        app.logger.info(json.dumps({'request_id':identifier,'route':request.url_rule.rule if request.url_rule else 'unmatched',
            'method':request.method,'status':response.status_code,'duration_ms':round((time.monotonic()-getattr(g,'request_started',time.monotonic()))*1000,2)}))
        return response
