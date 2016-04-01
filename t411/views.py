﻿# -*- coding: utf-8 -*-
from django.shortcuts import render,redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth import authenticate, login, logout
from django.core.urlresolvers import reverse
from django.http import HttpResponse

from t411.forms import ConnexionForm, T411Form, DossierForm
from t411.models import Profil,T411

import json
import time, datetime
from math import floor
def connexion(request):
    error = False
    if request.user.is_active:
        t411, utilisateur = connexionT411(request)
    
    if request.method == "POST":
        form = ConnexionForm(request.POST)
        if form.is_valid():
            username = form.cleaned_data["username"]
            password = form.cleaned_data["password"]
            user = authenticate(username=username, password=password)  # Nous vérifions si les données sont correctes
            if user:  # Si l'objet renvoyé n'est pas None
                login(request, user)  # nous connectons l'utilisateur 
                t411, utilisateur = connexionT411(request)
                if utilisateur.token=="" : return configT411()
                t411.get_info()
            else: # sinon une erreur sera affichée
                error = True
    else:
        form = ConnexionForm()

    return render(request, 't411/connexion.html', locals())

@login_required 
def configRut(request,error = False, erreur=""):
    config = "t411:configRut"
    titre = " Configuration du dossier RuTorrent"
    configReussi = "Le dossier Rutorrent est correctement configuré ! "
    
    t411, utilisateur = connexionT411(request)
    success = False
    
    if request.method == "POST":
        form = DossierForm(request.POST,instance=utilisateur)
        if form.is_valid():
            profil = form.save(commit=False)
            
            dossier = profil.dossier.split("\\")       
            if len(dossier)>0 : profil.dossier = '/'.join(dossier)
            dossier = profil.dossier.split('/')
            if len(dossier)>0 : profil.dossier = '/'.join(dossier)
            if profil.dossier !="" and profil.dossier[-1] !=  "/" : profil.dossier = profil.dossier + "/"
            if profil.dossier !="" and profil.dossier[0] !=  "/" : profil.dossier = "/" + profil.dossier
            
            profil.save()
            success = True
    else:
        form = DossierForm(instance=utilisateur)

    return render(request, 't411/config.html', locals())
    
@login_required      
def configT411(request, error = False, erreur=""):
    config = "t411:configT411"
    titre = " Configuration du compte T411"
    configReussi = "Le compte T411 est correctement configuré ! "
    
    t411, utilisateur = connexionT411(request)
    success = False
    
    if request.method == "POST":
        form = T411Form(request.POST,instance=utilisateur)
        if form.is_valid():
            username = form.cleaned_data["pseudoT411"]
            password = form.cleaned_data["password"]
            demandeToken = t411.get_token(username, password) 
            if 'error' in demandeToken:  
                error = True
                erreur = demandeToken['error']
            else: 
                utilisateur.pseudoT411 = username
                utilisateur.uid = demandeToken['uid']
                utilisateur.token = demandeToken['token']
                utilisateur.save()
                t411.get_info()
                success = True
    else:
        form = T411Form(instance=utilisateur)

    return render(request, 't411/config.html', locals())
    
def deconnexion(request):
    logout(request)
    return redirect(reverse('t411:connexion'))
    
def home(request):
    
    if request.user.is_active:
        t411, utilisateur = connexionT411(request)
    return render(request, 't411/accueil.html',locals())
    
@login_required
def top_torrents(request,type_top="100"):

    t411, utilisateur= connexionT411(request)
    
    maj = type_top[0].upper()
    type_top = maj + type_top[1:]
    
    torrents = getattr(t411,"top"+type_top)()
    if 'error' in torrents:
        return configT411(request,True,torrents['error'])
    else :
        categories,btnCat = mise_en_forme(torrents)
    
    return render(request, 't411/torrents.html',locals())
    
@login_required
def detail_torrent(request,id_torrent):

    t411, utilisateur= connexionT411(request)
    detail = t411.details(id_torrent)
    
    if 'error' in detail:
        return configT411(request,True,detail['error'])
        
    return render(request, 't411/detail_torrents.html',locals())
    

@login_required
def search(request,search):

    t411, utilisateur = connexionT411(request)
    
    torrents = t411.search(search,{'limit':200})
    torrents=torrents['torrents']
    
    if 'error' in torrents:
        return configT411(request,True,torrents['error'])
    else :
        categories,btnCat = mise_en_forme(torrents)
        
    return render(request, 't411/search.html',locals())
    
@login_required
def download(request,id_torrent):
    
    t411, utilisateur = connexionT411(request)
    if t411.profil.dossier == "" or t411.profil.dossier == None :
        return HttpResponse("dossier")
    else: dossier = t411.profil.dossier  
    
    fichier = t411.download(id_torrent)
    
    if 'error' in fichier:
        return HttpResponse(fichier['error'])

    nomFichier = fichier.headers['Content-Disposition'].split('=')[1][1:-1]
    nomFichier = nomFichier.decode('windows-1252')
    
    chemin = dossier+nomFichier 
    chemin = chemin.encode('utf8')
    
    #chemin = "C:\\Users\\cyprien\\Downloads\\torrents\\"+nomFichier
        
    with open(chemin, 'wb') as fd:
        for chunk in fichier.iter_content():
            fd.write(chunk)
        
    return HttpResponse("success")
    
def connexionT411(request):
    utilisateur = Profil.objects.get_or_create(user_id=request.user.id)[0]
    t411 = T411(utilisateur)
    if utilisateur.token !="" : t411.get_info()
    
    return t411,utilisateur   

def mise_en_forme(torrents):
    categories ={}
    
    for torrent in torrents:
        torrent['added'] = str(duree_ecoulee(torrent['added']))
        if torrent['categoryname'] in categories:
            categories[torrent['categoryname']].append(torrent)
        else: categories[torrent['categoryname']] = [torrent]
    i=0    
    # for key in categories.keys():
            # categories[key] = sorted(categories[key], key=lambda cat: cat['seeders'])
            # if i==1:
                # print(categories[key])
            # i=1    
            
    btnCat = sorted(categories.keys())
    return categories,btnCat
           
def duree_ecoulee(date_from):
        """Returns a float equals to the timedelta between two dates given as string."""
        DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"
        date_to = time.strftime(DATETIME_FORMAT)
        from_dt = datetime.datetime.strptime(date_from, DATETIME_FORMAT)
        to_dt = datetime.datetime.strptime(date_to, DATETIME_FORMAT)
        timedelta = to_dt - from_dt
        
        ans = floor(timedelta.days/360)
        mois = floor(timedelta.days/30)
        jours = timedelta.days
        
        if ans: diff_day = "%.f"%ans+ " ans"
        elif mois: diff_day = "%.f"%mois + " mois"
        elif jours: diff_day = "%.f"%jours + " jours"
        else : diff_day = "%.f"%floor(timedelta.seconds/3600)+" heures"

        return diff_day