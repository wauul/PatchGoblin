import {Component,type ReactNode} from 'react';
import {TriangleAlert} from 'lucide-react';
import {captureFrontend} from './telemetry';
import {t} from './locale';
import './design.css';

export function RecoveryScreen({eventId}:{eventId?:string}) {
  return <main className="recovery-screen" role="alert" data-sentry-block>
    <a className="brand" href="/"><img src="/goblin.svg" width="48" height="48" alt=""/><span>PatchGoblin</span></a>
    <div className="recovery-content"><TriangleAlert size={32} aria-hidden="true"/>
      <h1>{t('This page hit a snag')}</h1>
      <p>{t('Reload to try again. Your queued jobs will keep their progress.')}</p>
      <button className="button primary" onClick={()=>location.reload()}>{t('Reload page')}</button>
      <a href="/dashboard">{t('Return to dashboard')}</a>
      {eventId&&<small>{t('Support reference')}: {eventId}</small>}
    </div>
  </main>;
}
export default class RecoveryBoundary extends Component<{children:ReactNode},{failed:boolean;eventId?:string}> {
  state:{failed:boolean;eventId?:string}={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error){this.setState({eventId:captureFrontend(error,'render')});}
  render(){return this.state.failed?<RecoveryScreen eventId={this.state.eventId}/>:this.props.children;}
}
