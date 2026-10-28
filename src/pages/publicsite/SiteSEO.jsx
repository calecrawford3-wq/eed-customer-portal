import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
const pages={
 '': ['Elite Engine Development | Micro Sprint Racing Engines','Suzuki GSX-R600 and Yamaha YZF-R6 micro sprint race engines. Precision engine builds, refreshes, machining, fuel injection and real track testing.'],
 engines:['600cc Micro Sprint Engine Programs | Elite Engine Development','Explore Elite GSX-R600 and Yamaha R6 racing engine refreshes, track-ready builds and Elite Spec engine programs.'],
 builder:['Configure a Micro Sprint Racing Engine | Elite','Configure your Suzuki GSX-R600 or Yamaha YZF-R6 micro sprint engine program with Elite Engine Development.'],
 machining:['Cylinder Head Machining & Valve Jobs | Elite','Micro sprint cylinder head valve jobs, valve seat work, head resurfacing and engine case decking. Mail-in machining services.'],
 injection:['Elite FDS Fuel Delivery System | Elite Engine Development','Elite FDS bolt-on fuel delivery and FuelTech engine management, exclusively for Elite engine customers.'],
 results:['Elite Racing Results & Team Elite | Elite Engine Development','See racing results and highlights from Elite-powered 600cc micro sprint engines.'],
 about:['About Elite Engine Development | Racing Engine Specialists','Oklahoma-based 600cc micro sprint racing engine specialists. Dyno development and real track testing in our own cars.'],
 development:['Dyno & Track Engine Testing | Elite Engine Development','Engine development combines dyno testing with real-world track testing in our own micro sprint race cars.'],
 showcase:['Micro Sprint Engine Build Showcase | Elite','Explore Elite Suzuki GSX-R600 and Yamaha YZF-R6 race engine builds and completed-engine photography.'],
 contact:['Contact Elite Engine Development | Oklahoma','Contact Elite Engine Development for 600cc micro sprint engine builds, machining, and Elite FDS inquiries.'],
 inquiry:['Request an Engine Build Quote | Elite Engine Development','Request a quote for micro sprint racing engine builds, cylinder head machining, or Elite FDS. No account required.'],
 testimonials:['Customer Reviews | Elite Engine Development','Read published customer experiences with Elite Engine Development racing engine programs.']
};
export default function SiteSEO(){const {pathname}=useLocation();useEffect(()=>{const slug=pathname.replace(/^\/site\/?/,'').split('/')[0];const [title,description]=pages[slug]||pages[''];document.title=title;let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement('meta');meta.name='description';document.head.appendChild(meta)}meta.content=description;let canonical=document.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical)}canonical.href='https://eliteenginedevelopment.com'+(pathname==='/site'?'/':pathname);return()=>{document.title='Elite Engine Development'}},[pathname]);return null}
