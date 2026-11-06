import React from 'react';
import LegalSealPhoto from './LegalSealPhoto';
// Single renderer shared by admin, portal and public agreement pages.
// Never fall back to a raw HEIC URL: browsers display a blank image.
export default function SealTagPhoto(props){return <LegalSealPhoto {...props}/>;}
