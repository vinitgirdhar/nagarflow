"""Authenticated product APIs. Permissions are enforced by auth_service before dispatch."""
import re
from flask import Blueprint,g,jsonify,request
from database import data_path
from dispatch_service import DispatchError
import ingestion

product=Blueprint('product',__name__,url_prefix='/api')

def intake(kind):
    if len(request.get_data())>256*1024:raise DispatchError('Webhook payload exceeds 256 KB.')
    receipt=ingestion.enqueue(data_path(),kind,request.headers.get('X-Nagarflow-Event-ID'),request.get_json(silent=True),request.get_data())
    return jsonify(receipt),202

@product.get('/operations')
def operations():
    return jsonify(ingestion.status(data_path()))

@product.post('/operations/receipts/<identifier>/retry')
def retry_receipt(identifier):
    if not re.fullmatch(r'[a-f0-9]{32}',identifier):raise DispatchError('Invalid receipt ID.')
    ingestion.retry(data_path(),identifier,g.user['id'])
    return jsonify({'success':True})


@product.route('/knowledge/documents',methods=['GET','POST'])
def knowledge_documents():
    import knowledge
    if request.method=='GET':return jsonify({'documents':knowledge.documents(data_path())})
    return jsonify({'id':knowledge.save(data_path(),request.get_json(silent=True),g.user['id'])}),201

@product.patch('/knowledge/documents/<identifier>')
def knowledge_change(identifier):
    import knowledge
    knowledge.change(data_path(),identifier,request.get_json(silent=True),g.user['id'])
    return jsonify({'success':True})

@product.post('/knowledge/query')
def knowledge_query():
    import knowledge
    data=request.get_json(silent=True) or {}
    if not isinstance(data,dict) or set(data)!={'question'}:raise DispatchError('Supply a question only.')
    return jsonify(knowledge.query(data_path(),data['question']))


@product.get('/forecasts')
def forecasts():
    from forecasting import forecast
    if set(request.args)-{'as_of','zone'}:raise DispatchError('Unknown forecast parameter.')
    return jsonify(forecast(data_path(),request.args.get('as_of'),request.args.get('zone')))


@product.post('/fleet/vehicles')
def create_vehicle():
    from workflows import create_vehicle
    return jsonify({'id':create_vehicle(data_path(),request.get_json(silent=True),g.user['id'])}),201

@product.post('/maintenance/tasks')
def create_task():
    from workflows import create_task
    return jsonify({'id':create_task(data_path(),request.get_json(silent=True),g.user['id'])}),201

@product.get('/weather/status')
def weather_status():
    from workflows import weather
    return jsonify(weather(data_path()))


@product.patch('/complaints/<identifier>')
def classify_complaint(identifier):
    from workflows import classify_complaint
    classify_complaint(data_path(),identifier,request.get_json(silent=True),g.user['id'])
    return jsonify({'success':True})
