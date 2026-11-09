import {useEffect,useState} from 'react';
import {edge} from '../lib/adminApi.js';
export default function TelegramStatus(){const [status,setStatus]=useState(null);useEffect(()=>{let active=true;edge('admin-create-rider',{action:'status'}).then(data=>{if(active)setStatus(data.telegramEnabled);}).catch(()=>{});return()=>{active=false;};},[]);return <p className="order-badge">Telegram: {status===null?'unavailable':status?'on':'off'}</p>;}
